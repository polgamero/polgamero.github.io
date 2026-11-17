export const DECK_COPY_LIMITS_DOCUMENT = 'deckCopyLimits';
export const DEFAULT_DECK_COPY_LIMIT = 4;

export function isUnlimitedBasicLand(card) {
  return String(card?.type || '').toLowerCase().includes('básica');
}

export function canConfigureDeckCopyLimit(card) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(card?.id ?? '') &&
    !/^disc_/i.test(card.id) && card.acquisition?.type !== 'discovery' &&
    !card.isToken && !isUnlimitedBasicLand(card);
}

export function normalizeDeckCopyLimits(document) {
  const values = document?.schemaVersion === 1 ? document.overrides : null;
  const overrides = Object.create(null);
  if (values && typeof values === 'object' && !Array.isArray(values)) {
    for (const [id, limit] of Object.entries(values)) {
      if (canConfigureDeckCopyLimit({ id }) && Number.isInteger(limit) && limit >= 1 && limit <= DEFAULT_DECK_COPY_LIMIT) {
        overrides[id] = limit;
      }
    }
  }
  return overrides;
}

export function configuredDeckCopyLimit(card, overrides) {
  if (canConfigureDeckCopyLimit(card) && overrides && Object.hasOwn(overrides, card.id)) return overrides[card.id];
  return Number.isSafeInteger(card?.deckCopyLimit) && card.deckCopyLimit > 0 ? card.deckCopyLimit : null;
}

export function deckCopyLimit(card, generalLimit = DEFAULT_DECK_COPY_LIMIT, overrides) {
  if (isUnlimitedBasicLand(card)) return Infinity;
  if (canConfigureDeckCopyLimit(card) && overrides?.[card.id] === DEFAULT_DECK_COPY_LIMIT) return generalLimit;
  return Math.min(configuredDeckCopyLimit(card, overrides) ?? generalLimit, generalLimit);
}

export function cardHasDeckCopyLimit(card, overrides) {
  return configuredDeckCopyLimit(card, overrides) !== null;
}
