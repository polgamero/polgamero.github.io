// Argentinia 23.21.5 — server authority for card publication.
import { TRUSTED_CARD_POOL, TRUSTED_CARD_IDS } from './cardCatalog.js';
import { PUBLISHED_CARD_BASELINE_SET, PUBLISHED_CARD_BASELINE_VERSION } from './publishedCardBaseline.js';
import { economyError } from '../shared/errors.js';

export const CARD_CATALOG_SCHEMA_VERSION = 1;

function normalizeOverride(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  if (typeof value.enabled === 'boolean') out.enabled = value.enabled;
  if (typeof value.name === 'string' && value.name.trim()) out.name = value.name.replace(/\s+/g,' ').trim().slice(0,90);
  return Object.keys(out).length ? Object.freeze(out) : null;
}
export function normalizeCardPublicationPolicy(data={}) {
  const source = data?.overrides && typeof data.overrides === 'object' && !Array.isArray(data.overrides) ? data.overrides : {};
  const overrides = {};
  for (const [id,value] of Object.entries(source)) {
    if (!TRUSTED_CARD_IDS.has(id)) continue;
    const normalized=normalizeOverride(value); if (normalized) overrides[id]=normalized;
  }
  return Object.freeze({schemaVersion:CARD_CATALOG_SCHEMA_VERSION,baselineVersion:PUBLISHED_CARD_BASELINE_VERSION,overrides:Object.freeze(overrides)});
}
export async function loadCardPublicationPolicy(db, tx=null) {
  const ref=db.doc('gameConfig/cardCatalog');
  const snap=tx ? await tx.get(ref) : await ref.get();
  return normalizeCardPublicationPolicy(snap.exists ? snap.data()||{} : {});
}
export function cardEnabledByPolicy(cardId, policy) {
  const id=String(cardId||'');
  if (!TRUSTED_CARD_IDS.has(id)) return false;
  const explicit=policy?.overrides?.[id]?.enabled;
  return typeof explicit === 'boolean' ? explicit : PUBLISHED_CARD_BASELINE_SET.has(id);
}
export function assertCardEnabled(cardId, policy) {
  const id=String(cardId||'');
  if (!cardEnabledByPolicy(id,policy)) throw economyError('CARD_DISABLED',{cardId:id});
  return id;
}
export function enabledTrustedPool(policy) { return TRUSTED_CARD_POOL.filter(card=>cardEnabledByPolicy(card.id,policy)); }
export function effectiveCardName(card, policy) { return String(policy?.overrides?.[card?.id]?.name || card?.name || card?.id || ''); }
