// js/landSearch.js — 23.14.4 LAND 3 · Advanced Land Tutor
// Helpers puros para búsquedas de Tierras. La biblioteca sigue siendo zona privada;
// este módulo sólo normaliza filtros/destinos y selecciona candidatos para humano/bot.

import { landMatchesFilter, isLandPermanent } from './permanentTypes.js';
import { gameRandom } from './gameRng.js';

export const LAND_SEARCH_DESTINATIONS = Object.freeze(['hand', 'battlefield', 'battlefield_tapped']);

export function normalizeLandSearchEffect(effect = {}) {
  const amount = Math.max(0, Math.floor(Number(effect.amount ?? 1) || 0));
  const filter = typeof effect.filter === 'string' && effect.filter.trim() ? effect.filter.trim() : 'any';
  const destination = LAND_SEARCH_DESTINATIONS.includes(effect.destination) ? effect.destination : 'battlefield';
  return {
    amount,
    filter,
    destination,
    // Una búsqueda en una zona oculta que exige una cualidad ("una Tierra", "una básica", etc.)
    // puede encontrar menos cartas que el máximo, incluso cero. LAND 3 usa ese contrato por default.
    allowFewer: effect.allowFewer !== false,
    // CR 701.23e: buscar no revela por sí solo. Sólo se publica la identidad si el efecto
    // lo ordena expresamente; una carta puesta en battlefield se vuelve pública al entrar.
    reveal: effect.reveal === true
  };
}

export function getLandSearchCandidates(deck, filter = 'any') {
  if (!Array.isArray(deck)) return [];
  return deck
    .map((card, index) => ({ card, index }))
    .filter(entry => entry.card && isLandPermanent(entry.card) && landMatchesFilter(entry.card, filter));
}

export function scoreLandForSearch(card, destination = 'battlefield') {
  if (!card || !isLandPermanent(card)) return -Infinity;
  let score = 10;
  if (!landMatchesFilter(card, 'basic')) score += 18;
  if (card.activatedAbility || (Array.isArray(card.activatedAbilities) && card.activatedAbilities.length)) score += 12;
  if (Array.isArray(card.producesOptions)) score += card.producesOptions.length * 4;
  if (card.produces) score += 2;
  score += Math.max(1, Number(card.manaAmount) || 1) * 2;
  if (destination === 'battlefield_tapped' && card.entersTapped) score += 2;
  return score;
}

export function chooseBotLandSearchEntries(deck, filter = 'any', amount = 1, destination = 'battlefield') {
  const max = Math.max(0, Math.floor(Number(amount) || 0));
  return getLandSearchCandidates(deck, filter)
    .sort((a, b) => scoreLandForSearch(b.card, destination) - scoreLandForSearch(a.card, destination) || a.index - b.index)
    .slice(0, max);
}

export function shuffleLibraryInPlace(deck, randomFn = gameRandom) {
  if (!Array.isArray(deck)) return deck;
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
