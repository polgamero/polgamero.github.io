// js/textLayout.js — Entrega 23.16.5.2 · DFC face-aware layout keys
// Ajuste NO destructivo y presentation-only del texto de cada carta.
// El contenido sigue viniendo exclusivamente de los JSON; por cardId sólo persistimos
// escala tipográfica, interlineado, tamaño del flavor, separación y altura del rules box.
//
// Persistencia pública/admin: gameConfig/textLayouts
// - cualquiera puede leer (todas las superficies renderizan igual)
// - sólo Admin puede escribir (Firestore Rules ya protegen gameConfig)

import { loadPublicGameConfigDocument, saveAdminGameConfigDocument } from './firebaseClient.js';

export const TEXT_LAYOUT_SCHEMA_VERSION = 1;
export const TEXT_LAYOUT_DOCUMENT_ID = 'textLayouts';
export const TEXT_LAYOUT_CACHE_KEY = 'argentinia.textLayouts.v1';
export const TEXT_LAYOUT_DEFAULT = Object.freeze({
  fontScale: 1,
  lineHeightScale: 1,
  flavorScale: 1,
  flavorGapScale: 1,
  boxHeight: 42
});
export const TEXT_LAYOUT_LIMITS = Object.freeze({
  minFontScale: 0.70,
  maxFontScale: 1.35,
  minLineHeightScale: 0.85,
  maxLineHeightScale: 1.25,
  minFlavorScale: 0.72,
  maxFlavorScale: 1.25,
  minFlavorGapScale: 0,
  maxFlavorGapScale: 1.8,
  minBoxHeight: 36,
  maxBoxHeight: 52
});

const CARD_ID_RE = /^[A-Za-z0-9_-]{1,80}(?:::(?:front|back))?$/;
const EPSILON = 0.0005;
let activeLayouts = Object.freeze({});
let remoteLoaded = false;
let loadPromise = null;
let lastLoadError = null;

function isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function isElementLike(value) { return !!value && typeof value === 'object' && !!value.style && !!value.dataset && !!value.classList; }
function finiteNumber(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function round3(value) { return Math.round(value * 1000) / 1000; }

export function normalizeCardTextLayout(layout) {
  if (!isRecord(layout)) return { ...TEXT_LAYOUT_DEFAULT };
  return {
    fontScale: round3(clamp(finiteNumber(layout.fontScale, 1), TEXT_LAYOUT_LIMITS.minFontScale, TEXT_LAYOUT_LIMITS.maxFontScale)),
    lineHeightScale: round3(clamp(finiteNumber(layout.lineHeightScale, 1), TEXT_LAYOUT_LIMITS.minLineHeightScale, TEXT_LAYOUT_LIMITS.maxLineHeightScale)),
    flavorScale: round3(clamp(finiteNumber(layout.flavorScale, 1), TEXT_LAYOUT_LIMITS.minFlavorScale, TEXT_LAYOUT_LIMITS.maxFlavorScale)),
    flavorGapScale: round3(clamp(finiteNumber(layout.flavorGapScale, 1), TEXT_LAYOUT_LIMITS.minFlavorGapScale, TEXT_LAYOUT_LIMITS.maxFlavorGapScale)),
    boxHeight: round3(clamp(finiteNumber(layout.boxHeight, 42), TEXT_LAYOUT_LIMITS.minBoxHeight, TEXT_LAYOUT_LIMITS.maxBoxHeight))
  };
}

export function isDefaultCardTextLayout(layout) {
  const n = normalizeCardTextLayout(layout);
  return Object.keys(TEXT_LAYOUT_DEFAULT).every(key => Math.abs(n[key] - TEXT_LAYOUT_DEFAULT[key]) < EPSILON);
}

function normalizeLayoutsDocument(documentData) {
  if (!isRecord(documentData)) return {};
  if (documentData.schemaVersion != null && documentData.schemaVersion !== TEXT_LAYOUT_SCHEMA_VERSION) return {};
  const source = isRecord(documentData.layouts) ? documentData.layouts : {};
  const normalized = {};
  for (const [cardId, rawLayout] of Object.entries(source)) {
    if (!CARD_ID_RE.test(cardId)) continue;
    const layout = normalizeCardTextLayout(rawLayout);
    if (!isDefaultCardTextLayout(layout)) normalized[cardId] = layout;
  }
  return normalized;
}

function freezeLayouts(layouts) {
  return Object.freeze(Object.fromEntries(Object.entries(layouts).map(([id, layout]) => [id, Object.freeze({ ...layout })])));
}
function writeLocalCache(layouts) {
  try { localStorage.setItem(TEXT_LAYOUT_CACHE_KEY, JSON.stringify({ schemaVersion: TEXT_LAYOUT_SCHEMA_VERSION, layouts })); } catch {}
}
function readLocalCache() {
  try {
    const raw = localStorage.getItem(TEXT_LAYOUT_CACHE_KEY);
    return raw ? normalizeLayoutsDocument(JSON.parse(raw)) : {};
  } catch { return {}; }
}
activeLayouts = freezeLayouts(readLocalCache());

export function getCardTextLayoutsSnapshot() {
  return Object.fromEntries(Object.entries(activeLayouts).map(([id, layout]) => [id, { ...layout }]));
}
function legacyFrontLayoutId(id) {
  return String(id || '').endsWith('::front') ? String(id).slice(0, -7) : '';
}
export function getCardTextLayout(cardId) {
  const id = String(cardId || '');
  const explicit = activeLayouts[id];
  if (explicit) return { ...explicit };
  const legacyId = legacyFrontLayoutId(id);
  const legacy = legacyId ? activeLayouts[legacyId] : null;
  return legacy ? { ...legacy } : { ...TEXT_LAYOUT_DEFAULT };
}
export function hasCustomCardTextLayout(cardId) {
  const id = String(cardId || '');
  return !!activeLayouts[id] || !!(legacyFrontLayoutId(id) && activeLayouts[legacyFrontLayoutId(id)]);
}

export function buildCardTextLayoutsDocument(layouts = activeLayouts) {
  const clean = {};
  const source = isRecord(layouts) ? layouts : {};
  for (const [cardId, layout] of Object.entries(source)) {
    if (!CARD_ID_RE.test(cardId)) continue;
    const normalized = normalizeCardTextLayout(layout);
    if (!isDefaultCardTextLayout(normalized)) clean[cardId] = normalized;
  }
  return { schemaVersion: TEXT_LAYOUT_SCHEMA_VERSION, layouts: clean };
}

function replaceActiveLayouts(layouts) {
  activeLayouts = freezeLayouts(layouts);
  writeLocalCache(activeLayouts);
}

export function applyCardTextLayoutToBox(box, cardId, layoutOverride = null) {
  if (!isElementLike(box)) return;
  const id = String(cardId || '');
  if (id) box.dataset.cardTextLayoutId = id;
  const layout = layoutOverride ? normalizeCardTextLayout(layoutOverride) : getCardTextLayout(id);
  const autoTextCqw = finiteNumber(box.dataset.autoTextCqw, 6);
  box.style.setProperty('--card-text-effective-size', `${round3(autoTextCqw * layout.fontScale)}cqw`);
  box.style.setProperty('--card-text-line-height', String(round3(1.14 * layout.lineHeightScale)));
  box.style.setProperty('--card-flavor-line-height', String(round3(1.12 * layout.lineHeightScale)));
  box.style.setProperty('--card-flavor-font-size', `${round3(layout.flavorScale)}em`);
  box.style.setProperty('--card-flavor-gap', `${round3(0.36 * layout.flavorGapScale)}em`);
  box.style.setProperty('--card-text-box-height', `${layout.boxHeight}cqh`);
  box.dataset.customTextLayout = isDefaultCardTextLayout(layout) ? '0' : '1';
}

export function applyCardTextLayoutToVisibleBoxes(cardId) {
  if (typeof document === 'undefined') return;
  const id = String(cardId || '');
  document.querySelectorAll('.card-text-box[data-card-text-layout-id]').forEach(box => {
    if (box.dataset.cardTextLayoutId === id) applyCardTextLayoutToBox(box, id);
  });
}
export function applyAllCardTextLayoutsToVisibleBoxes() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.card-text-box[data-card-text-layout-id]').forEach(box => {
    applyCardTextLayoutToBox(box, box.dataset.cardTextLayoutId || '');
  });
}

export async function ensureCardTextLayoutsLoaded({ force = false } = {}) {
  if (remoteLoaded && !force) return getCardTextLayoutsSnapshot();
  if (loadPromise && !force) return loadPromise;
  loadPromise = (async () => {
    try {
      const documentData = await loadPublicGameConfigDocument(TEXT_LAYOUT_DOCUMENT_ID);
      const normalized = normalizeLayoutsDocument(documentData);
      replaceActiveLayouts(normalized);
      remoteLoaded = true;
      lastLoadError = null;
      applyAllCardTextLayoutsToVisibleBoxes();
      return getCardTextLayoutsSnapshot();
    } catch (error) {
      lastLoadError = error;
      throw error;
    } finally { loadPromise = null; }
  })();
  return loadPromise;
}

export function registerCardTextBox(box, cardId) {
  if (!isElementLike(box)) return;
  const id = String(cardId || '');
  if (!id) return;
  box.dataset.cardTextLayoutId = id;
  applyCardTextLayoutToBox(box, id);
  const canAttemptRemoteLoad = typeof window !== 'undefined' && typeof document !== 'undefined' && typeof window.location?.href === 'string';
  if (canAttemptRemoteLoad && !remoteLoaded && !loadPromise && !lastLoadError) {
    ensureCardTextLayoutsLoaded().catch(error => {
      try { console.warn('[TEXT_LAYOUT_LOAD_FALLBACK] Se mantiene cache/default:', error?.message || error); } catch {}
    });
  }
}

export async function saveCardTextLayout(cardId, layoutOrNull) {
  const id = String(cardId || '').trim();
  if (!CARD_ID_RE.test(id)) throw new Error('TEXT_LAYOUT_INVALID_CARD_ID');

  let baseLayouts = getCardTextLayoutsSnapshot();
  try {
    const latest = await loadPublicGameConfigDocument(TEXT_LAYOUT_DOCUMENT_ID);
    baseLayouts = normalizeLayoutsDocument(latest);
  } catch (error) {
    throw new Error(`TEXT_LAYOUT_REFRESH_BEFORE_SAVE_FAILED:${error?.message || error}`);
  }

  const next = { ...baseLayouts };
  const normalized = layoutOrNull == null ? { ...TEXT_LAYOUT_DEFAULT } : normalizeCardTextLayout(layoutOrNull);
  const legacyId = legacyFrontLayoutId(id);
  if (legacyId) delete next[legacyId];
  if (isDefaultCardTextLayout(normalized)) delete next[id];
  else next[id] = normalized;

  await saveAdminGameConfigDocument(TEXT_LAYOUT_DOCUMENT_ID, buildCardTextLayoutsDocument(next));
  replaceActiveLayouts(next);
  remoteLoaded = true;
  lastLoadError = null;
  applyCardTextLayoutToVisibleBoxes(id);
  return getCardTextLayout(id);
}

export function getCardTextLayoutLoadState() {
  return { remoteLoaded, loading: !!loadPromise, lastError: lastLoadError || null, customCount: Object.keys(activeLayouts).length };
}
