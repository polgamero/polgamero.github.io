// Argentinia 23.21.5 — Card Publication Control + Admin Card Identity.
// Sparse public config lives in gameConfig/cardCatalog. Historical 880 cards are enabled
// by frozen baseline; every future card ID defaults to unpublished until Admin enables it.

import { loadPublicGameConfigDocument, saveAdminGameConfigDocument } from './firebaseClient.js';
import { PUBLISHED_CARD_BASELINE_SET, PUBLISHED_CARD_BASELINE_VERSION } from './publishedCardBaseline.js';

export const CARD_CATALOG_SCHEMA_VERSION = 1;
export const CARD_CATALOG_DOCUMENT_ID = 'cardCatalog';
export const CARD_CATALOG_CACHE_KEY = 'argentinia.cardCatalog.v1';
const CARD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

let overrides = Object.freeze({});
let loaded = false;
let loadPromise = null;
const listeners = new Set();

function normalizeName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').replace(/[^a-z0-9]+/g,' ').trim();
}
function cleanDisplayName(value) {
  const name = String(value || '').replace(/\s+/g,' ').trim();
  if (!name) throw new Error('CARD_CATALOG_NAME_REQUIRED');
  if (name.length > 90) throw new Error('CARD_CATALOG_NAME_TOO_LONG');
  return name;
}
function normalizeOverride(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  if (typeof value.enabled === 'boolean') out.enabled = value.enabled;
  if (typeof value.name === 'string' && value.name.trim()) out.name = value.name.replace(/\s+/g,' ').trim().slice(0,90);
  return Object.keys(out).length ? Object.freeze(out) : null;
}
function normalizeDocument(doc) {
  const source = doc?.overrides && typeof doc.overrides === 'object' && !Array.isArray(doc.overrides) ? doc.overrides : {};
  const out = {};
  for (const [id,value] of Object.entries(source)) {
    if (!CARD_ID_RE.test(id)) continue;
    const normalized = normalizeOverride(value);
    if (normalized) out[id] = normalized;
  }
  return Object.freeze(out);
}
function loadCache() {
  try {
    const raw = localStorage.getItem(CARD_CATALOG_CACHE_KEY);
    if (!raw) return;
    overrides = normalizeDocument(JSON.parse(raw));
  } catch {}
}
function saveCache() {
  try { localStorage.setItem(CARD_CATALOG_CACHE_KEY, JSON.stringify({schemaVersion:CARD_CATALOG_SCHEMA_VERSION,baselineVersion:PUBLISHED_CARD_BASELINE_VERSION,overrides})); } catch {}
}
function notify() { for (const fn of [...listeners]) { try { fn(getCardCatalogSnapshot()); } catch {} } }
loadCache();

export function isHistoricalPublishedCardId(cardId) { return PUBLISHED_CARD_BASELINE_SET.has(String(cardId || '')); }
export function getCardPublicationState(cardOrId) {
  const id = String(typeof cardOrId === 'object' ? cardOrId?.id : cardOrId || '');
  const override = overrides[id] || null;
  return Object.freeze({
    id,
    enabled: typeof override?.enabled === 'boolean' ? override.enabled : isHistoricalPublishedCardId(id),
    nameOverride: override?.name || null,
    historicalBaseline: isHistoricalPublishedCardId(id),
    explicitEnabledOverride: typeof override?.enabled === 'boolean'
  });
}
function replaceOwnName(value, oldName, newName, key='') {
  if (typeof value === 'string') {
    if (!oldName || oldName === newName || ['id','image','backImage','audio','filename'].includes(key)) return value;
    return value.split(oldName).join(newName);
  }
  if (Array.isArray(value)) return value.map(v => replaceOwnName(v,oldName,newName,key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k,v] of Object.entries(value)) out[k] = replaceOwnName(v,oldName,newName,k);
    return out;
  }
  return value;
}
export function applyCardCatalogToCard(rawCard) {
  if (!rawCard || typeof rawCard !== 'object') return rawCard;
  const state = getCardPublicationState(rawCard);
  const canonicalName = String(rawCard.name || rawCard.id || '');
  const displayName = state.nameOverride || canonicalName;
  const effective = replaceOwnName(rawCard, canonicalName, displayName);
  effective.name = displayName;
  effective.canonicalName = canonicalName;
  effective.enabled = state.enabled;
  effective.publication = state;
  return effective;
}
export function applyCardCatalogToPool(rawCards=[]) { return rawCards.map(applyCardCatalogToCard); }
export function getCardCatalogSnapshot() { return {schemaVersion:CARD_CATALOG_SCHEMA_VERSION,baselineVersion:PUBLISHED_CARD_BASELINE_VERSION,overrides:{...overrides},loaded}; }
export function subscribeCardCatalog(fn) { if (typeof fn !== 'function') return ()=>{}; listeners.add(fn); return ()=>listeners.delete(fn); }

export async function ensureCardCatalogLoaded({force=false,allowCachedFallback=true}={}) {
  if (loaded && !force) return getCardCatalogSnapshot();
  if (loadPromise && !force) return loadPromise;
  loadPromise = (async()=>{
    try {
      const doc = await loadPublicGameConfigDocument(CARD_CATALOG_DOCUMENT_ID);
      overrides = normalizeDocument(doc);
      loaded = true;
      saveCache(); notify();
      return getCardCatalogSnapshot();
    } catch (error) {
      if (!allowCachedFallback) throw error;
      loaded = false;
      // Cached overrides are kept; future unknown IDs remain disabled by baseline fail-closed default.
      return getCardCatalogSnapshot();
    } finally { loadPromise = null; }
  })();
  return loadPromise;
}

function assertUniqueDisplayName(cardId, desiredName, allCards=[]) {
  const key = normalizeName(desiredName);
  for (const card of allCards) {
    if (!card?.id || String(card.id) === String(cardId)) continue;
    const rawName = String(card.canonicalName || card.name || '');
    const otherOverride = overrides[card.id]?.name;
    if (normalizeName(otherOverride || rawName) === key) throw new Error('CARD_CATALOG_NAME_DUPLICATE');
  }
}
export async function saveCardCatalogOverride(card, changes={}, {allCards=[]}={}) {
  const id = String(card?.id || card || '').trim();
  if (!CARD_ID_RE.test(id)) throw new Error('CARD_CATALOG_INVALID_CARD_ID');
  let base;
  try { base = normalizeDocument(await loadPublicGameConfigDocument(CARD_CATALOG_DOCUMENT_ID)); }
  catch (error) { throw new Error(`CARD_CATALOG_REFRESH_BEFORE_SAVE_FAILED:${error?.message || error}`); }
  const current = {...(base[id] || {})};
  if (Object.hasOwn(changes,'enabled')) {
    const desired = !!changes.enabled;
    // Sparse default: baseline=true, future=false. Remove redundant override.
    if (desired === isHistoricalPublishedCardId(id)) delete current.enabled; else current.enabled = desired;
  }
  if (Object.hasOwn(changes,'name')) {
    const canonical = String(card?.canonicalName || card?.name || '').trim();
    const desired = cleanDisplayName(changes.name);
    assertUniqueDisplayName(id,desired,allCards);
    if (normalizeName(desired) === normalizeName(canonical) && desired === canonical) delete current.name; else current.name = desired;
  }
  const next = {...base};
  if (Object.keys(current).length) next[id] = current; else delete next[id];
  await saveAdminGameConfigDocument(CARD_CATALOG_DOCUMENT_ID, {schemaVersion:CARD_CATALOG_SCHEMA_VERSION,baselineVersion:PUBLISHED_CARD_BASELINE_VERSION,overrides:next});
  overrides = Object.freeze(Object.fromEntries(Object.entries(next).map(([k,v])=>[k,Object.freeze({...v})])));
  loaded = true; saveCache(); notify();
  return getCardPublicationState(id);
}
