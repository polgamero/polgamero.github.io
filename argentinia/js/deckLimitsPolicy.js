import { loadPublicGameConfigDocument } from './firebaseClient.js';
import {
  DECK_COPY_LIMITS_DOCUMENT, cardHasDeckCopyLimit as hasLimit,
  deckCopyLimit as resolveLimit, normalizeDeckCopyLimits
} from './deckCopyLimit.js';

let overrides = normalizeDeckCopyLimits(null);
let pending = null;
let revision = 0;

export function setDeckCopyLimits(document) {
  overrides = normalizeDeckCopyLimits(document);
  revision++;
  return overrides;
}

export function refreshDeckCopyLimits() {
  if (pending) return pending;
  const startedAt = revision;
  pending = loadPublicGameConfigDocument(DECK_COPY_LIMITS_DOCUMENT, { server: true })
    .then(document => startedAt === revision ? setDeckCopyLimits(document) : overrides)
    .finally(() => { pending = null; });
  return pending;
}

export function deckCopyLimit(card, generalLimit, policy = overrides) {
  return resolveLimit(card, generalLimit, policy);
}

export function cardHasDeckCopyLimit(card, policy = overrides) {
  return hasLimit(card, policy);
}
