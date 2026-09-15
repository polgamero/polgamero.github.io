// js/privateZoneProtocol.js — Entrega 23.10
// Contrato puro para selecciones sobre zonas privadas del rival.
// Este módulo NO conoce state ni Firestore: construye ofertas saneadas y valida commits.

export const PRIVATE_ZONE_VISIBILITY = Object.freeze({
  OPAQUE: 'opaque_slots',
  REVEAL: 'reveal_candidates'
});

export const PRIVATE_ZONE_NAMES = Object.freeze(['hand', 'deck']);
export const PRIVATE_ZONE_FILTERS = Object.freeze(['any', 'land', 'nonland', 'creature', 'noncreature', 'instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker']);

function randomChunk() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    return [...buf].map(n => n.toString(36)).join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function createPrivateSelectionToken(prefix = 'pz') {
  return `${prefix}_${randomChunk()}`;
}

const PRIVATE_REVEAL_CARD_FIELDS = Object.freeze([
  // Only printed/public characteristics needed by the canonical card renderer. Runtime
  // engine metadata, ownership state, hidden-zone identity maps and internal AI hints are
  // deliberately excluded even when an effect authorizes the chooser to LOOK at a card.
  'id','name','type','manaCost','cmc','rarity','colors','text','flavorText','image',
  'power','toughness','baseStats','keywords','legendary','loyalty','loyaltyAbilities'
]);

function clonePrivateRevealValue(value) {
  if (Array.isArray(value)) return value.map(clonePrivateRevealValue);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) out[key] = clonePrivateRevealValue(child);
  return out;
}

function sanitizePrivateFaceDescriptor(card) {
  if (!card || typeof card !== 'object') return null;
  const out = {};
  for (const key of PRIVATE_REVEAL_CARD_FIELDS) {
    if (card[key] === undefined) continue;
    if (key === 'loyaltyAbilities') {
      out.loyaltyAbilities = Array.isArray(card.loyaltyAbilities)
        ? card.loyaltyAbilities.map(ability => ({
            cost: Number(ability?.cost || 0),
            name: ability?.name || '',
            text: ability?.text || ''
          }))
        : [];
      continue;
    }
    out[key] = clonePrivateRevealValue(card[key]);
  }
  out.id = card.id || null;
  out.name = card.name || null;
  out.type = card.type || null;
  out.cmc = Number.isFinite(Number(card.cmc)) ? Number(card.cmc) : 0;
  out.colors = Array.isArray(card.colors) ? [...card.colors] : [];
  if (card?.dfc?.kind === 'transform' && card.dfc.backFace) {
    out.dfc = {
      kind: 'transform',
      backFace: sanitizePrivateFaceDescriptor(card.dfc.backFace)
    };
  }
  return out;
}

export function sanitizePrivateCardDescriptor(card) {
  return sanitizePrivateFaceDescriptor(card);
}

export function buildPrivateZoneOffer({ requestId, ownerRole, chooserRole, zone, cards, eligibleCards = null, visibility = PRIVATE_ZONE_VISIBILITY.OPAQUE, amount = 1, operation = 'select', range = 'all', filter = 'any' }) {
  if (!requestId) throw new Error('private-zone offer necesita requestId');
  if (!PRIVATE_ZONE_NAMES.includes(zone)) throw new Error(`Zona privada no soportada: ${zone}`);
  if (!PRIVATE_ZONE_FILTERS.includes(filter)) throw new Error(`Filtro privado no soportado: ${filter}`);
  const source = Array.isArray(cards) ? cards : [];
  const eligibleSet = new Set(Array.isArray(eligibleCards) ? eligibleCards : source);
  const candidateCount = source.length;
  const eligibleCount = source.filter(card => eligibleSet.has(card)).length;
  const safeAmount = Math.max(0, Math.min(Math.floor(Number(amount) || 0), eligibleCount));
  const tokenMap = new Map();
  const candidates = source.map((card, slot) => {
    const token = createPrivateSelectionToken('slot');
    tokenMap.set(token, card);
    const base = { token, slot, selectable: eligibleSet.has(card) };
    if (visibility === PRIVATE_ZONE_VISIBILITY.REVEAL) base.card = sanitizePrivateCardDescriptor(card);
    return base;
  });
  return {
    offer: {
      requestId,
      ownerRole,
      chooserRole,
      zone,
      visibility,
      amount: safeAmount,
      candidateCount,
      eligibleCount,
      operation,
      range,
      filter,
      candidates
    },
    tokenMap
  };
}

export function validatePrivateZoneSelection(offer, selectedTokens) {
  const tokens = Array.isArray(selectedTokens) ? selectedTokens : [];
  const unique = [...new Set(tokens)];
  const legal = new Map((offer?.candidates || []).map(c => [c.token, c]));
  if (unique.length !== Number(offer?.amount || 0)) return { ok: false, reason: 'wrong_amount', tokens: [] };
  if (unique.some(token => !legal.has(token))) return { ok: false, reason: 'unknown_token', tokens: [] };
  if (unique.some(token => legal.get(token)?.selectable === false)) return { ok: false, reason: 'ineligible_token', tokens: [] };
  return { ok: true, reason: null, tokens: unique };
}

export function resolvePrivateZoneSelection(tokenMap, offer, selectedTokens) {
  const validation = validatePrivateZoneSelection(offer, selectedTokens);
  if (!validation.ok) return { ...validation, cards: [] };
  const cards = validation.tokens.map(token => tokenMap?.get(token)).filter(Boolean);
  if (cards.length !== validation.tokens.length) return { ok: false, reason: 'stale_offer', tokens: [], cards: [] };
  return { ok: true, reason: null, tokens: validation.tokens, cards };
}
