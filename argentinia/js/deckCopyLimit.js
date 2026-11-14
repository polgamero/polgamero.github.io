export function deckCopyLimit(card, generalLimit = 4) {
  if (String(card?.type || '').toLowerCase().includes('básica')) return Infinity;
  return cardHasDeckCopyLimit(card) ? Math.min(card.deckCopyLimit, generalLimit) : generalLimit;
}

export function cardHasDeckCopyLimit(card) {
  return Number.isSafeInteger(card?.deckCopyLimit) && card.deckCopyLimit > 0;
}
