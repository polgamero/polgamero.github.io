// HF23.3.16.2 — Carta Favorita: base + variante mejorada, fail-closed y físicamente consistente.
import { TRUSTED_CARD_IDS } from '../trusted/cardCatalog.js';

export const FAVORITE_ENHANCED_SUFFIX = '::enhanced';

const cleanId = value => String(value || '').trim();
const ownedCount = (collection = [], baseId = '') => (Array.isArray(collection) ? collection : []).reduce((n, raw) => n + (String(raw) === baseId ? 1 : 0), 0);
const hasEnhancement = (profile = {}, baseId = '') => !!(profile?.enhancements && typeof profile.enhancements === 'object' && !Array.isArray(profile.enhancements) && profile.enhancements[baseId]);
const evolutionStage = (profile = {}, baseId = '') => {
  const row = profile?.evolutions && typeof profile.evolutions === 'object' && !Array.isArray(profile.evolutions) ? profile.evolutions[baseId] : null;
  return Math.max(0, Math.min(2, Math.floor(Number(row?.stage ?? row) || 0)));
};

export function parseFavoriteCardId(rawId) {
  const id = cleanId(rawId);
  if (id.endsWith(FAVORITE_ENHANCED_SUFFIX)) {
    return { id, baseId:id.slice(0, -FAVORITE_ENHANCED_SUFFIX.length), variant:'enhanced' };
  }
  return { id, baseId:id, variant:'base' };
}

export function favoriteCardIdIfOwned(profile = {}, requestedId = null) {
  const parsed = parseFavoriteCardId(requestedId == null ? profile?.favoriteCardId : requestedId);
  if (!parsed.id || !parsed.baseId || !TRUSTED_CARD_IDS.has(parsed.baseId)) return '';
  const collection = Array.isArray(profile?.collection) ? profile.collection : [];
  const count = ownedCount(collection, parsed.baseId);
  if (count < 1) return '';
  const enhanced = hasEnhancement(profile, parsed.baseId);
  const evolved = evolutionStage(profile, parsed.baseId) > 0;
  const committedSpecialCopies = (enhanced ? 1 : 0) + (evolved ? 1 : 0);
  // A favorite enhanced must correspond to the dedicated enhanced physical copy.
  if (parsed.variant === 'enhanced') {
    if (!enhanced || count < committedSpecialCopies) return '';
    return `${parsed.baseId}${FAVORITE_ENHANCED_SUFFIX}`;
  }
  // A base favorite must still have at least one non-special physical copy.
  return count > committedSpecialCopies ? parsed.baseId : '';
}

export function favoriteCardPatchForState(profile = {}, overrides = {}) {
  const id = cleanId(profile?.favoriteCardId);
  if (!id) return {};
  const nextProfile = {
    ...profile,
    collection: Object.prototype.hasOwnProperty.call(overrides, 'collection') ? overrides.collection : profile?.collection,
    enhancements: Object.prototype.hasOwnProperty.call(overrides, 'enhancements') ? overrides.enhancements : profile?.enhancements,
    evolutions: Object.prototype.hasOwnProperty.call(overrides, 'evolutions') ? overrides.evolutions : profile?.evolutions
  };
  return favoriteCardIdIfOwned(nextProfile, id) ? {} : { favoriteCardId:'' };
}

export function favoriteCardPatchForCollection(profile = {}, nextCollection = []) {
  return favoriteCardPatchForState(profile, { collection:nextCollection });
}
