// js/landGraveyard.js — Argentinia 23.14.5 · LAND 4 Lands & Graveyard
// Reglas puras para permisos tipo Crucible/Ramunap y recuperación masiva tipo
// Splendid Reclamation. La mutación real de zonas vive en main/stackManager.

export function isLandCard(card) {
  return !!card && !card.isToken && String(card.type || '').includes('Tierra');
}

export function landGraveyardFilterMatches(card, filter = 'any') {
  if (!isLandCard(card)) return false;
  const type = String(card.type || '').toLowerCase();
  if (!filter || filter === 'any') return true;
  if (filter === 'basic') return /tierra\s+básica/i.test(String(card.type || ''));
  if (filter === 'nonbasic') return !/tierra\s+básica/i.test(String(card.type || ''));
  if (String(filter).startsWith('subtype:')) return type.includes(String(filter).slice(8).trim().toLowerCase());
  return false;
}

export function normalizeLandGraveyardReturnEffect(effect = {}) {
  const isAll = effect.type === 'return_all_lands_from_graveyard' || effect.amount === 'all';
  const destination = effect.destination === 'battlefield' ? 'battlefield' : 'battlefield_tapped';
  return {
    type: 'return_lands_from_graveyard',
    amount: isAll ? 'all' : Math.max(0, Math.floor(Number(effect.amount ?? 1))),
    filter: effect.filter || 'any',
    destination,
    all: isAll
  };
}

export function cardGrantsLandPlayFromGraveyard(card) {
  if (!card) return false;
  if (card.playLandsFromGraveyard === true) return true;
  const effects = [card.staticEffect, ...(Array.isArray(card.staticEffects) ? card.staticEffects : [])].filter(Boolean);
  return effects.some(effect => effect?.type === 'play_lands_from_graveyard');
}

export function hasLandPlayFromGraveyardPermission(permanents = []) {
  return permanents.some(item => cardGrantsLandPlayFromGraveyard(item?.card || item));
}

export function playableLandGraveyardEntries(graveyard = [], filter = 'any') {
  return graveyard.map((card, index) => ({ card, index })).filter(entry => landGraveyardFilterMatches(entry.card, filter));
}
