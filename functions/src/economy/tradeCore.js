// v23.21.0 — Mercado de Pases pure contracts.
// One listing reserves one real copy. Up to three strict BUSCO criteria may be
// exact cards or rarity/color filters. Offers are always 1 card <-> 1 card.

export const TRADE_LIMITS = Object.freeze({
  maxWantedCriteria: 3,
  maxOffersPerListing: 10,
  maxOutgoingOffers: 5,
  maxCompletedPerWeek: 3
});

// Admin may tune the product limits, but these hard ceilings protect document size,
// transaction fan-out and accidental/malicious configuration values.
export const TRADE_HARD_LIMITS = Object.freeze({
  maxWantedCriteria: 3,
  maxOffersPerListing: 50,
  maxOutgoingOffers: 20,
  maxCompletedPerWeek: 20
});

function boundedInt(value, fallback, min, max) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function normalizeTradeLimits(config = {}) {
  return {
    maxWantedCriteria: boundedInt(config.tradeMaxWantedCriteria, TRADE_LIMITS.maxWantedCriteria, 1, TRADE_HARD_LIMITS.maxWantedCriteria),
    maxOffersPerListing: boundedInt(config.tradeMaxOffersPerListing, TRADE_LIMITS.maxOffersPerListing, 1, TRADE_HARD_LIMITS.maxOffersPerListing),
    maxOutgoingOffers: boundedInt(config.tradeMaxOutgoingOffers, TRADE_LIMITS.maxOutgoingOffers, 1, TRADE_HARD_LIMITS.maxOutgoingOffers),
    maxCompletedPerWeek: boundedInt(config.tradeMaxCompletedPerWeek, TRADE_LIMITS.maxCompletedPerWeek, 1, TRADE_HARD_LIMITS.maxCompletedPerWeek)
  };
}

export const TRADE_RARITIES = Object.freeze(['Common', 'Uncommon', 'Rare', 'Mythic']);
export const TRADE_COLORS = Object.freeze(['W', 'U', 'B', 'R', 'G', 'C']);

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizeReservation(raw = {}) {
  const source = plainObject(raw);
  const cards = {};
  for (const [cardId, countRaw] of Object.entries(plainObject(source.cards))) {
    const count = Math.max(0, Math.floor(Number(countRaw) || 0));
    if (cardId && count > 0) cards[String(cardId)] = count;
  }
  return {
    cards,
    activeListingId: source.activeListingId ? String(source.activeListingId) : null,
    activeOfferIds: Array.isArray(source.activeOfferIds)
      ? [...new Set(source.activeOfferIds.map(String).filter(Boolean))].slice(0, TRADE_HARD_LIMITS.maxOutgoingOffers)
      : []
  };
}

export function reservationIsEmpty(raw = {}) {
  const reservation = normalizeReservation(raw);
  return !reservation.activeListingId
    && reservation.activeOfferIds.length === 0
    && Object.keys(reservation.cards).length === 0;
}

export function changeReservedCard(raw, cardId, delta) {
  const reservation = normalizeReservation(raw);
  const cleanId = String(cardId || '');
  const next = Math.max(0, (reservation.cards[cleanId] || 0) + Math.trunc(Number(delta) || 0));
  if (next > 0) reservation.cards[cleanId] = next;
  else delete reservation.cards[cleanId];
  return reservation;
}

export function ownedCardCount(profile = {}, cardId) {
  const clean = String(cardId || '');
  return (Array.isArray(profile.collection) ? profile.collection : []).reduce((n, id) => n + (String(id) === clean ? 1 : 0), 0);
}

function baseDeckCardId(value) {
  const id = String(value || '');
  return id.endsWith('::enhanced') ? id.slice(0, -'::enhanced'.length) : id;
}

export function protectedCardCount(profile = {}, cardId) {
  const clean = String(cardId || '');
  let maxDeckCopies = 0;
  for (const deck of Array.isArray(profile.decks) ? profile.decks : []) {
    let count = 0;
    for (const id of Array.isArray(deck?.cardIds) ? deck.cardIds : []) {
      if (baseDeckCardId(id) === clean) count += 1;
    }
    if (count > maxDeckCopies) maxDeckCopies = count;
  }
  const enhancements = plainObject(profile.enhancements);
  const enhancedProtected = enhancements[clean] ? 1 : 0;
  return Math.max(maxDeckCopies, enhancedProtected);
}

export function tradableCardCount(profile = {}, reservation = {}, cardId) {
  const clean = String(cardId || '');
  const owned = ownedCardCount(profile, clean);
  const protectedCopies = protectedCardCount(profile, clean);
  const reserved = normalizeReservation(reservation).cards[clean] || 0;
  return Math.max(0, owned - protectedCopies - reserved);
}

export function reservationsStillBacked(profile = {}, reservation = {}, cardId) {
  const clean = String(cardId || '');
  const owned = ownedCardCount(profile, clean);
  const protectedCopies = protectedCardCount(profile, clean);
  const reserved = normalizeReservation(reservation).cards[clean] || 0;
  return owned >= protectedCopies + reserved;
}

function normalizeExactCriterion(raw, trustedById) {
  const cardId = String(raw?.cardId || '');
  if (!trustedById.has(cardId)) throw new Error('TRADE_CRITERIA_INVALID');
  return { type: 'exact_card', cardId };
}

function normalizeAttributeCriterion(raw) {
  const rarityRaw = String(raw?.rarity || '').trim();
  const colorRaw = String(raw?.color || '').trim().toUpperCase();
  const rarity = TRADE_RARITIES.includes(rarityRaw) ? rarityRaw : null;
  const color = TRADE_COLORS.includes(colorRaw) ? colorRaw : null;
  if (!rarity && !color) throw new Error('TRADE_CRITERIA_INVALID');
  return { type: 'attributes', rarity, color };
}

export function normalizeWantedCriteria(rawCriteria, acceptAnyCard, trustedById, limits = TRADE_LIMITS) {
  if (acceptAnyCard === true) return [];
  if (!Array.isArray(rawCriteria) || rawCriteria.length < 1 || rawCriteria.length > limits.maxWantedCriteria) {
    throw new Error('TRADE_CRITERIA_INVALID');
  }
  const normalized = rawCriteria.map(raw => {
    const type = String(raw?.type || '');
    if (type === 'exact_card') return normalizeExactCriterion(raw, trustedById);
    if (type === 'attributes') return normalizeAttributeCriterion(raw);
    throw new Error('TRADE_CRITERIA_INVALID');
  });
  const keys = normalized.map(value => JSON.stringify(value));
  if (new Set(keys).size !== keys.length) throw new Error('TRADE_CRITERIA_INVALID');
  return normalized;
}

export function cardMatchesCriterion(card, criterion) {
  if (!card || !criterion) return false;
  if (criterion.type === 'exact_card') return String(card.id || '') === String(criterion.cardId || '');
  if (criterion.type !== 'attributes') return false;
  if (criterion.rarity && String(card.rarity || '') !== criterion.rarity) return false;
  if (criterion.color) {
    const colors = Array.isArray(card.colors) ? card.colors.map(String) : [];
    if (criterion.color === 'C') {
      if (colors.length !== 0) return false;
    } else if (!colors.includes(criterion.color)) return false;
  }
  return true;
}

export function cardMatchesWanted(card, listing = {}) {
  if (listing.acceptAnyCard === true) return true;
  const criteria = Array.isArray(listing.wantedCriteria) ? listing.wantedCriteria : [];
  return criteria.some(criterion => cardMatchesCriterion(card, criterion));
}

export function removeOneCard(collection, cardId) {
  const source = Array.isArray(collection) ? collection : [];
  const index = source.findIndex(id => String(id) === String(cardId));
  if (index < 0) throw new Error('TRADE_CARD_NOT_OWNED');
  return [...source.slice(0, index), ...source.slice(index + 1)];
}

export function swapOneCard(collectionA, cardA, collectionB, cardB) {
  const nextA = removeOneCard(collectionA, cardA);
  const nextB = removeOneCard(collectionB, cardB);
  nextA.push(String(cardB));
  nextB.push(String(cardA));
  return { collectionA: nextA, collectionB: nextB };
}
