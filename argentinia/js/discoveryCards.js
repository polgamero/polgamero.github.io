// Argentinia · Santuario Stage 3 — contrato canónico de cartas Discovery.
// Este módulo define identidad y política; NO concede cartas ni implementa el Santuario.

export const DISCOVERY_ACQUISITION_TYPE = 'discovery';
export const DISCOVERY_ICON_GLYPH = '📷';
export const DISCOVERY_ICON_ASSET = './assets/images/ui/descubribles.png';
export const DISCOVERY_POOL_SIZE = 100;
export const DISCOVERY_AFFINITIES = Object.freeze(['W','U','B','R','G']);

// Regla dura del producto. Estas propiedades NO son configurables por carta ni por Admin:
// una carta Discovery no puede auto-habilitar un canal prohibido desde JSON.
export const DISCOVERY_CARD_POLICY = Object.freeze({
  tradeable: false,
  marketEligible: false,
  mixerEligible: false,
  evolutionEligible: false,
  packEligible: false,
  starterEligible: false,
  randomRewardEligible: false,
  enhancementBlockedByDiscovery: false
});

export const DISCOVERY_FORBIDDEN_CHANNELS = Object.freeze([
  'trade',
  'market',
  'mixer',
  'evolution',
  'pack',
  'starter',
  'random_reward'
]);

export function isDiscoveryCardId(cardId) {
  return /^disc_\d{3}(?:::(?:evo1|evo2))?(?:::(?:front|back))?$/.test(String(cardId || '').trim());
}

export function isDiscoveryCard(card) {
  return !!card && String(card?.acquisition?.type || '').trim().toLowerCase() === DISCOVERY_ACQUISITION_TYPE;
}

export function discoveryPolicyForCard(card) {
  if (!isDiscoveryCard(card)) return Object.freeze({ discovery:false });
  return Object.freeze({ discovery:true, ...DISCOVERY_CARD_POLICY });
}

export function isDiscoveryChannelAllowed(card, channel) {
  if (!isDiscoveryCard(card)) return true;
  return !DISCOVERY_FORBIDDEN_CHANNELS.includes(String(channel || '').trim().toLowerCase());
}

// Discovery no crea una segunda regla de mejoras: solamente deja explícito que pertenecer
// a esta familia NO bloquea la mejora con Fichas. Las reglas normales de la Máquina 1
// (p.ej. elegibilidad por tipo de carta) siguen siendo las únicas que deciden si una carta
// concreta puede recibir una mejora.
export function discoveryAllowsEnhancement(card) {
  return !isDiscoveryCard(card) || DISCOVERY_CARD_POLICY.enhancementBlockedByDiscovery === false;
}

export function validateDiscoveryMetadata(card) {
  if (!isDiscoveryCard(card)) return { ok:true, discovery:false, errors:[] };
  const errors=[];
  if (!card?.id || !String(card.id).trim()) errors.push('DISCOVERY_ID_REQUIRED');
  if (card?.acquisition?.type !== DISCOVERY_ACQUISITION_TYPE) errors.push('DISCOVERY_TYPE_MUST_BE_CANONICAL');
  // No aceptamos flags de excepción en el payload de una carta: la política es global.
  for (const key of ['tradeable','marketEligible','mixerEligible','evolutionEligible','packEligible','starterEligible','randomRewardEligible']) {
    if (card?.acquisition && Object.prototype.hasOwnProperty.call(card.acquisition,key)) errors.push(`DISCOVERY_POLICY_OVERRIDE_FORBIDDEN:${key}`);
  }
  return { ok:errors.length===0, discovery:true, errors };
}

export function discoveryMetadataForCard(card) {
  if (!isDiscoveryCard(card)) return null;
  const raw = card?.discovery && typeof card.discovery === 'object' ? card.discovery : {};
  const number = Number(raw.number);
  const affinity = String(raw.affinity || '').trim().toUpperCase();
  const clue = String(raw.clue || '').trim();
  return Object.freeze({
    number: Number.isInteger(number) ? number : null,
    affinity: DISCOVERY_AFFINITIES.includes(affinity) ? affinity : null,
    clue
  });
}

export function discoveryClueForCard(card) { return discoveryMetadataForCard(card)?.clue || ''; }
export function discoveryAffinityForCard(card) { return discoveryMetadataForCard(card)?.affinity || null; }
export function discoveryNumberForCard(card) { return discoveryMetadataForCard(card)?.number ?? null; }
