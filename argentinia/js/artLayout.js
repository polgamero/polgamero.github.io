// js/artLayout.js — Entrega 23.16.5.2 · DFC face-aware layout keys
// Encuadre NO destructivo del arte de las cartas. Los PNG originales nunca se modifican:
// por cardId sólo persistimos scale/x/y y createCardElement aplica ese transform al <img>.
//
// Persistencia pública/admin: gameConfig/artLayouts
// - cualquiera puede leer (para renderizar igual la carta en todas partes)
// - sólo Admin puede escribir (lo blindan Firestore Rules existentes)
//
// El módulo no carga Firebase al importarse. Usa la fachada lazy únicamente cuando una carta
// real necesita el layout o cuando el Admin abre el editor. Una cache local permite aplicar
// de inmediato el último encuadre conocido sin bloquear el render mientras llega Firestore.

import { loadPublicGameConfigDocument, saveAdminGameConfigDocument } from './firebaseClient.js';

export const ART_LAYOUT_SCHEMA_VERSION = 1;
export const ART_LAYOUT_DOCUMENT_ID = 'artLayouts';
export const ART_LAYOUT_CACHE_KEY = 'argentinia.artLayouts.v1';
export const ART_LAYOUT_DEFAULT = Object.freeze({ scale: 1, x: 0, y: 0 });
export const ART_LAYOUT_LIMITS = Object.freeze({
  minScale: 0.75,
  maxScale: 3,
  minOffset: -45,
  maxOffset: 45
});

const CARD_ID_RE = /^[A-Za-z0-9_-]{1,80}(?:::(?:front|back))?$/;
const EPSILON = 0.0005;

let activeLayouts = Object.freeze({});
let remoteLoaded = false;
let loadPromise = null;
let lastLoadError = null;

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isElementLike(value) {
  return !!value && typeof value === 'object' && !!value.style && !!value.dataset && !!value.classList;
}

function finiteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

export function normalizeArtLayout(layout) {
  if (!isRecord(layout)) return { ...ART_LAYOUT_DEFAULT };
  return {
    scale: round3(clamp(finiteNumber(layout.scale, 1), ART_LAYOUT_LIMITS.minScale, ART_LAYOUT_LIMITS.maxScale)),
    x: round3(clamp(finiteNumber(layout.x, 0), ART_LAYOUT_LIMITS.minOffset, ART_LAYOUT_LIMITS.maxOffset)),
    y: round3(clamp(finiteNumber(layout.y, 0), ART_LAYOUT_LIMITS.minOffset, ART_LAYOUT_LIMITS.maxOffset))
  };
}

export function isDefaultArtLayout(layout) {
  const normalized = normalizeArtLayout(layout);
  return Math.abs(normalized.scale - ART_LAYOUT_DEFAULT.scale) < EPSILON &&
    Math.abs(normalized.x - ART_LAYOUT_DEFAULT.x) < EPSILON &&
    Math.abs(normalized.y - ART_LAYOUT_DEFAULT.y) < EPSILON;
}

function normalizeLayoutsDocument(documentData) {
  if (!isRecord(documentData)) return {};
  if (documentData.schemaVersion != null && documentData.schemaVersion !== ART_LAYOUT_SCHEMA_VERSION) return {};
  const source = isRecord(documentData.layouts) ? documentData.layouts : {};
  const normalized = {};
  for (const [cardId, rawLayout] of Object.entries(source)) {
    if (!CARD_ID_RE.test(cardId)) continue;
    const layout = normalizeArtLayout(rawLayout);
    if (!isDefaultArtLayout(layout)) normalized[cardId] = layout;
  }
  return normalized;
}

function freezeLayouts(layouts) {
  const frozenEntries = Object.fromEntries(
    Object.entries(layouts).map(([cardId, layout]) => [cardId, Object.freeze({ ...layout })])
  );
  return Object.freeze(frozenEntries);
}

function writeLocalCache(layouts) {
  try {
    localStorage.setItem(ART_LAYOUT_CACHE_KEY, JSON.stringify({
      schemaVersion: ART_LAYOUT_SCHEMA_VERSION,
      layouts
    }));
  } catch {}
}

function readLocalCache() {
  try {
    const raw = localStorage.getItem(ART_LAYOUT_CACHE_KEY);
    if (!raw) return {};
    return normalizeLayoutsDocument(JSON.parse(raw));
  } catch {
    return {};
  }
}

// Cache sincrónica: si este navegador ya vio los layouts, no hay flash de encuadre default.
activeLayouts = freezeLayouts(readLocalCache());

export function getArtLayoutsSnapshot() {
  return Object.fromEntries(Object.entries(activeLayouts).map(([id, layout]) => [id, { ...layout }]));
}

function legacyFrontLayoutId(id) {
  return String(id || '').endsWith('::front') ? String(id).slice(0, -7) : '';
}

export function getArtLayout(cardId) {
  const id = String(cardId || '');
  const explicit = activeLayouts[id];
  if (explicit) return { ...explicit };
  const legacyId = legacyFrontLayoutId(id);
  const legacy = legacyId ? activeLayouts[legacyId] : null;
  return legacy ? { ...legacy } : { ...ART_LAYOUT_DEFAULT };
}

export function hasCustomArtLayout(cardId) {
  const id = String(cardId || '');
  return !!activeLayouts[id] || !!(legacyFrontLayoutId(id) && activeLayouts[legacyFrontLayoutId(id)]);
}

export function buildArtLayoutsDocument(layouts = activeLayouts) {
  const clean = {};
  const source = isRecord(layouts) ? layouts : {};
  for (const [cardId, layout] of Object.entries(source)) {
    if (!CARD_ID_RE.test(cardId)) continue;
    const normalized = normalizeArtLayout(layout);
    if (!isDefaultArtLayout(normalized)) clean[cardId] = normalized;
  }
  return { schemaVersion: ART_LAYOUT_SCHEMA_VERSION, layouts: clean };
}

function replaceActiveLayouts(layouts) {
  activeLayouts = freezeLayouts(layouts);
  writeLocalCache(activeLayouts);
}

export function applyArtLayoutToImage(img, cardId, layoutOverride = null) {
  if (!isElementLike(img)) return;
  const id = String(cardId || '');
  if (id) img.dataset.cardArtId = id;
  const layout = layoutOverride ? normalizeArtLayout(layoutOverride) : getArtLayout(id);

  // Sin layout custom NO agregamos transform: preserva pixel-a-pixel el renderer histórico
  // (width/height 120%, object-fit:cover, object-position:center top y static-position flex).
  if (isDefaultArtLayout(layout)) {
    if (img.dataset.artLayoutTransform === '1') {
      img.style.removeProperty('transform');
      img.style.removeProperty('transform-origin');
      img.style.removeProperty('will-change');
      delete img.dataset.artLayoutTransform;
    }
    return;
  }

  img.style.transformOrigin = 'center center';
  img.style.transform = `translate3d(${layout.x}%, ${layout.y}%, 0) scale(${layout.scale})`;
  img.style.willChange = 'transform';
  img.dataset.artLayoutTransform = '1';
}

export function applyArtLayoutToVisibleCardImages(cardId) {
  if (typeof document === 'undefined') return;
  const id = String(cardId || '');
  document.querySelectorAll('.card-art-image[data-card-art-id]').forEach(img => {
    if (img.dataset.cardArtId === id) applyArtLayoutToImage(img, id);
  });
}

export function applyAllArtLayoutsToVisibleCardImages() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.card-art-image[data-card-art-id]').forEach(img => {
    applyArtLayoutToImage(img, img.dataset.cardArtId || '');
  });
}

export async function ensureArtLayoutsLoaded({ force = false } = {}) {
  if (remoteLoaded && !force) return getArtLayoutsSnapshot();
  if (loadPromise && !force) return loadPromise;

  loadPromise = (async () => {
    try {
      const documentData = await loadPublicGameConfigDocument(ART_LAYOUT_DOCUMENT_ID);
      const normalized = normalizeLayoutsDocument(documentData);
      replaceActiveLayouts(normalized);
      remoteLoaded = true;
      lastLoadError = null;
      applyAllArtLayoutsToVisibleCardImages();
      return getArtLayoutsSnapshot();
    } catch (error) {
      lastLoadError = error;
      // La cache/default sigue siendo válida: el renderer no se rompe por una caída remota.
      throw error;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

// Se llama desde createCardElement. Es deliberadamente fire-and-forget: nunca convierte el
// render sincrónico de una carta en una dependencia de red. La primera carta dispara UNA
// sola carga compartida; las demás reutilizan esa Promise.
export function registerCardArtImage(img, cardId) {
  if (!isElementLike(img)) return;
  const id = String(cardId || '');
  if (!id) return;
  img.classList.add('card-art-image');
  img.dataset.cardArtId = id;
  applyArtLayoutToImage(img, id);

  const canAttemptRemoteLoad = typeof window !== 'undefined' && typeof document !== 'undefined' &&
    typeof window.location?.href === 'string';
  if (canAttemptRemoteLoad && !remoteLoaded && !loadPromise && !lastLoadError) {
    ensureArtLayoutsLoaded().catch(error => {
      try { console.warn('[ART_LAYOUT_LOAD_FALLBACK] Se mantiene cache/default:', error?.message || error); } catch {}
    });
  }
}

// Guardado Admin: antes de escribir refresca el documento remoto y mezcla el cardId actual.
// Eso reduce el riesgo de pisar una edición hecha desde otra pestaña. Firestore Rules siguen
// siendo la autoridad real que decide quién puede escribir gameConfig/artLayouts.
export async function saveArtLayout(cardId, layoutOrNull) {
  const id = String(cardId || '').trim();
  if (!CARD_ID_RE.test(id)) throw new Error('ART_LAYOUT_INVALID_CARD_ID');

  let baseLayouts = getArtLayoutsSnapshot();
  try {
    const latest = await loadPublicGameConfigDocument(ART_LAYOUT_DOCUMENT_ID);
    baseLayouts = normalizeLayoutsDocument(latest);
  } catch (error) {
    // Para GUARDAR no ocultamos un error remoto: si no podemos leer la versión actual,
    // evitamos escribir una copia potencialmente stale encima del documento.
    throw new Error(`ART_LAYOUT_REFRESH_BEFORE_SAVE_FAILED:${error?.message || error}`);
  }

  const next = { ...baseLayouts };
  const normalized = layoutOrNull == null ? { ...ART_LAYOUT_DEFAULT } : normalizeArtLayout(layoutOrNull);
  const legacyId = legacyFrontLayoutId(id);
  if (legacyId) delete next[legacyId];
  if (isDefaultArtLayout(normalized)) delete next[id];
  else next[id] = normalized;

  await saveAdminGameConfigDocument(ART_LAYOUT_DOCUMENT_ID, buildArtLayoutsDocument(next));
  replaceActiveLayouts(next);
  remoteLoaded = true;
  lastLoadError = null;
  applyArtLayoutToVisibleCardImages(id);
  return getArtLayout(id);
}

export function getArtLayoutLoadState() {
  return {
    remoteLoaded,
    loading: !!loadPromise,
    lastError: lastLoadError || null,
    customCount: Object.keys(activeLayouts).length
  };
}
