import { expectedEvolutionArtEntries } from './evolution.js';
// js/cardLoader.js
// ENTREGA 23.8.4 — auditoría segura por manifest + guardas anti-duplicación / anti-rate-limit.
// IMPORTANTE: el runtime NO hace HEAD/GET por carta. GitHub Actions genera un único manifest
// estático con los archivos existentes y el navegador lo consulta una sola vez.

import { PUBLIC_POOL_BASELINE } from './poolContract.js';
import { ensureCardCatalogLoaded, applyCardCatalogToPool, subscribeCardCatalog } from './cardPublication.js';
import { injectPrivateDiscoveryArtLayouts } from './artLayout.js';
import { injectPrivateDiscoveryTextLayouts } from './textLayout.js';

const IMAGE_MANIFEST_URL = './assets/images/cards/cards-image-manifest.json';
const DISCOVERY_PUBLIC_URL = './assets/data/discovery-public.json';

const DATA_FILES = {
  tierras: './assets/data/tierras.json',
  artefactos: './assets/data/artefactos.json',
  criaturas: './assets/data/criaturas.json',
  instantaneos: './assets/data/instantaneos.json',
  conjuros: './assets/data/conjuros.json',
  encantamientos: './assets/data/encantamientos.json',
  planeswalkers: './assets/data/planeswalkers.json'
};

function poolContractError(message, details = {}) {
  const error = new Error(`POOL_CONTRACT_VIOLATION: ${message}`);
  error.code = 'POOL_CONTRACT_VIOLATION';
  error.details = details;
  return error;
}

function validateLoadedPool(cardsByCategory, allCards) {
  const actualCounts = {};
  for (const [category, expected] of Object.entries(PUBLIC_POOL_BASELINE.categories)) {
    const cards = cardsByCategory[category];
    if (!Array.isArray(cards)) {
      throw poolContractError(`La categoría ${category} no es un array.`, { category });
    }
    actualCounts[category] = cards.length;
    if (cards.length !== expected) {
      throw poolContractError(
        `${category}: esperadas ${expected} cartas, recibidas ${cards.length}.`,
        { category, expected, actual: cards.length, actualCounts }
      );
    }
  }

  if (allCards.length !== PUBLIC_POOL_BASELINE.total) {
    throw poolContractError(
      `Total público esperado ${PUBLIC_POOL_BASELINE.total}, recibido ${allCards.length}.`,
      { expected: PUBLIC_POOL_BASELINE.total, actual: allCards.length, actualCounts }
    );
  }

  const ids = new Set();
  const duplicateIds = new Set();
  const missingIds = [];
  for (const card of allCards) {
    if (!card || typeof card.id !== 'string' || !card.id.trim()) {
      missingIds.push(card?.name || '(sin nombre)');
      continue;
    }
    if (ids.has(card.id)) duplicateIds.add(card.id);
    ids.add(card.id);
  }
  if (missingIds.length || duplicateIds.size) {
    throw poolContractError('IDs inválidos o duplicados en el pool.', {
      missingIdCards: missingIds,
      duplicateIds: [...duplicateIds]
    });
  }

  return actualCounts;
}

class CardDatabase {
  constructor() {
    this.rawCardsByCategory = {};
    this.rawAllCards = [];
    this.cardsByCategory = {};
    this.allCards = [];
    this.enabledCards = [];
    this.isLoaded = false;
    this.loadPromise = null;
    this.imageManifest = null;
    this.discoveryPublicCatalog = [];
    this.authorizedDiscoveryCards = [];
    this.imageManifestPromise = null;
    subscribeCardCatalog(() => { if (this.rawAllCards.length) this.refreshPublicationState(); });
  }

  async loadAll() {
    // Idempotencia fuerte: si boot() o cualquier caller futuro intenta cargar dos veces,
    // JAMÁS se vuelve a hacer push sobre allCards ni se duplica 511 -> 1022.
    if (this.isLoaded) return this.allCards;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.#loadAllOnce();
    try {
      return await this.loadPromise;
    } catch (error) {
      // Permite un reintento explícito posterior sólo si la carga falló; no deja un Promise
      // rechazado pegado para siempre.
      this.loadPromise = null;
      throw error;
    }
  }

  async #loadAllOnce() {
    const keys = Object.keys(DATA_FILES);
    const fetchPromises = keys.map(async (key) => {
      const response = await fetch(DATA_FILES[key], { cache:'no-store' });
      if (!response.ok) {
        const error = new Error(`Error al cargar ${DATA_FILES[key]}: HTTP ${response.status} ${response.statusText}`);
        error.code = response.status === 429 ? 'GITHUB_PAGES_RATE_LIMIT' : 'CARD_DATA_HTTP_ERROR';
        error.status = response.status;
        error.url = DATA_FILES[key];
        throw error;
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        throw poolContractError(`${DATA_FILES[key]} no devolvió un array JSON.`, { key });
      }
      return data;
    });

    const discoveryPublicPromise = fetch(DISCOVERY_PUBLIC_URL, { cache:'no-store' }).then(async response => {
      if (!response.ok) throw new Error(`DISCOVERY_PUBLIC_HTTP_ERROR:${response.status}`);
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length !== 100 || rows.some(row => !row || typeof row.clue !== 'string' || !row.clue.trim() || Object.keys(row).some(key => key !== 'clue'))) {
        throw poolContractError('El catálogo público Discovery debe contener exactamente 100 pistas anónimas.', { actual:Array.isArray(rows)?rows.length:null });
      }
      return rows.map(row => Object.freeze({ clue:String(row.clue).trim() }));
    });
    const [results, discoveryPublicCatalog] = await Promise.all([Promise.all(fetchPromises), discoveryPublicPromise]);

    // Construcción transaccional: no tocamos el estado compartido hasta que las siete
    // categorías estén descargadas y validadas. Una carga parcial jamás contamina el pool.
    const nextByCategory = {};
    const nextAllCards = [];
    keys.forEach((key, index) => {
      nextByCategory[key] = results[index];
      nextAllCards.push(...results[index]);
    });

    validateLoadedPool(nextByCategory, nextAllCards);

    // 23.21.5 publication/identity layer. Historical 880 default enabled; future IDs fail closed.
    await ensureCardCatalogLoaded({ allowCachedFallback: true });
    this.discoveryPublicCatalog = discoveryPublicCatalog;
    this.rawCardsByCategory = nextByCategory;
    this.rawAllCards = nextAllCards;
    this.refreshPublicationState();
    this.isLoaded = true;

    // La auditoría de imágenes queda disponible bajo demanda desde Admin/DEBUGGING.
    // 23.17.3.3: no imprime ni precarga diagnósticos del pool/imágenes durante el boot normal.

    return this.allCards;
  }

  async loadImageManifest({ force = false } = {}) {
    if (this.imageManifest && !force) return this.imageManifest;
    if (this.imageManifestPromise && !force) return this.imageManifestPromise;

    const url = force ? `${IMAGE_MANIFEST_URL}?audit=${Date.now()}` : IMAGE_MANIFEST_URL;
    const promise = (async () => {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        const error = new Error(`No se pudo cargar el manifiesto de imágenes: HTTP ${response.status}`);
        error.code = response.status === 404 ? 'IMAGE_MANIFEST_NOT_AVAILABLE' : 'IMAGE_MANIFEST_HTTP_ERROR';
        error.status = response.status;
        throw error;
      }
      const manifest = await response.json();
      if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.missing)) {
        const error = new Error('El manifiesto de imágenes no tiene el formato esperado.');
        error.code = 'IMAGE_MANIFEST_INVALID';
        throw error;
      }
      this.imageManifest = manifest;
      return manifest;
    })();

    if (!force) this.imageManifestPromise = promise;
    try {
      return await promise;
    } finally {
      if (!force) this.imageManifestPromise = null;
    }
  }

  async getImageAudit({ force = false } = {}) {
    const manifest = await this.loadImageManifest({ force });
    const evolutionFiles = new Set(Array.isArray(manifest?.evolutionImages?.files) ? manifest.evolutionImages.files : []);
    const expectedEvolution = expectedEvolutionArtEntries();
    const missingEvolutionImages = expectedEvolution.filter(entry => !evolutionFiles.has(entry.image));
    return {
      ...manifest,
      missingPreview: manifest.missing.slice(0, 20),
      missingEvolutionImages,
      missingEvolutionPreview: missingEvolutionImages.slice(0, 20),
      evolutionManifestAvailable: !!manifest.evolutionImages && Array.isArray(manifest.evolutionImages.files),
      missingTokenPreview: Array.isArray(manifest.missingTokenImages) ? manifest.missingTokenImages.slice(0, 20) : [],
      tokenManifestAvailable: !!manifest.tokenImages && Array.isArray(manifest.missingTokenImages)
    };
  }

  async reportMissingImagesFromManifest() {
    try {
      const audit = await this.getImageAudit();
      const imageStats = audit.images || {};
      const tokenStats = audit.tokenImages || null;
      const missing = Array.isArray(audit.missing) ? audit.missing : [];
      const missingEvolutionImages = Array.isArray(audit.missingEvolutionImages) ? audit.missingEvolutionImages : [];
      const missingTokenEffects = Array.isArray(audit.missingTokenImages) ? audit.missingTokenImages : [];
      const missingTokenFiles = new Set(missingTokenEffects.map(entry => entry?.image).filter(Boolean)).size;
      const unassignedTokenEffects = Array.isArray(audit.tokenEffectsWithoutImage) ? audit.tokenEffectsWithoutImage.length : 0;
      const missingBacks = missing.filter(entry => entry?.face === 'back').length;
      const missingFronts = missing.length - missingBacks;
      console.log(`[CardDatabase] Auditoría segura de imágenes: ${missingFronts} frente(s), ${missingBacks} reverso(s) DFC y ${missingEvolutionImages.length} arte(s) EVO sin archivo; ${missingTokenFiles} PNG de token faltante(s) (${missingTokenEffects.length} productor(es)); ${unassignedTokenEffects} token(s) sin filename; ${imageStats.existingFileCount ?? '?'} archivo(s) de cartas presentes. 1 manifest, 0 probes por cara/token/evolución.`);
      if (!tokenStats) console.warn('[CardDatabase] Manifest legacy: no contiene auditoría de imágenes de token.');
      if (missing.length) {
        console.groupCollapsed(`[CardDatabase] Primeras ${Math.min(20, missing.length)} imágenes faltantes de ${missing.length}`);
        console.table(missing.slice(0, 20).map(entry => ({
          id: entry.id,
          cara: entry.face === 'back' ? 'Reverso' : 'Frente',
          carta: entry.name,
          categoria: entry.category,
          png: entry.image
        })));
        console.info('Lista completa: Admin → DEBUGGING → Auditoría de imágenes.');
        console.groupEnd();
      }
      if (missingEvolutionImages.length) {
        console.groupCollapsed(`[CardDatabase] Evoluciones: ${missingEvolutionImages.length} PNG faltantes de ${expectedEvolutionArtEntries().length}`);
        console.table(missingEvolutionImages.slice(0, 20).map(entry => ({ baseId:entry.baseId, stage:`EVO${entry.stage}`, carta:entry.name, png:entry.image })));
        console.info('Lista completa: Admin → DEBUGGING → Auditoría de imágenes.');
        console.groupEnd();
      }
      if (missingTokenEffects.length) {
        console.groupCollapsed(`[CardDatabase] Tokens: ${missingTokenFiles} PNG faltantes / ${missingTokenEffects.length} efecto(s) productor(es)`);
        console.table(missingTokenEffects.slice(0, 20).map(entry => ({
          productor: entry.cardName,
          token: entry.tokenName,
          cantidad: entry.amount,
          png: entry.image,
          ruta: entry.path
        })));
        console.groupEnd();
      }
    } catch (error) {
      if (error?.code === 'IMAGE_MANIFEST_NOT_AVAILABLE') {
        console.warn('[CardDatabase] Manifiesto de imágenes no disponible. Activá el deploy por GitHub Actions de la Entrega 23.8.4 para generarlo automáticamente.');
      } else {
        console.warn('[CardDatabase] No se pudo leer la auditoría de imágenes (el juego continúa normalmente):', error);
      }
    }
  }

  setDiscoveryPublicCatalog(rows = []) {
    const src=Array.isArray(rows)?rows:[];
    const clues=[]; const seen=new Set();
    for(const row of src){
      if(!row || Object.keys(row).some(key=>key!=='clue')) return false;
      const clue=String(row.clue||'').replace(/\s+/g,' ').trim();
      const key=clue.normalize('NFKC').toLowerCase();
      if(!clue || seen.has(key)) return false;
      seen.add(key); clues.push(Object.freeze({clue}));
    }
    if(clues.length!==100) return false;
    clues.sort((a,b)=>a.clue.localeCompare(b.clue,'es',{sensitivity:'base'}));
    this.discoveryPublicCatalog=clues;
    return true;
  }

  injectAuthorizedDiscoveryCards(cards = []) {
    const rows = Array.isArray(cards) ? cards : [];
    const allowedClues = new Set((this.discoveryPublicCatalog || []).map(row => String(row?.clue || '')));
    const clean = [];
    const seen = new Set();
    for (const card of rows) {
      const id = String(card?.id || '').trim();
      const clue = String(card?.discovery?.clue || '').trim();
      if (!id || seen.has(id) || String(card?.acquisition?.type || '').toLowerCase() !== 'discovery' || !allowedClues.has(clue)) continue;
      seen.add(id); clean.push(Object.freeze({...card}));
    }
    this.authorizedDiscoveryCards = clean;
    injectPrivateDiscoveryArtLayouts(clean);
    injectPrivateDiscoveryTextLayouts(clean);
    const base = [];
    for (const cards of Object.values(this.rawCardsByCategory || {})) base.push(...cards);
    this.rawAllCards = [...base, ...clean];
    this.refreshPublicationState();
    return clean.length;
  }

  clearAuthorizedDiscoveryCards() {
    return this.injectAuthorizedDiscoveryCards([]);
  }

  refreshPublicationState() {
    if (!this.rawAllCards.length) return;
    const effectiveAll = applyCardCatalogToPool(this.rawAllCards);
    const byId = new Map(effectiveAll.map(card => [card.id, card]));
    const effectiveByCategory = {};
    for (const [category, cards] of Object.entries(this.rawCardsByCategory)) {
      effectiveByCategory[category] = cards.map(card => byId.get(card.id)).filter(Boolean);
    }
    this.cardsByCategory = effectiveByCategory;
    this.allCards = effectiveAll;
    this.enabledCards = effectiveAll.filter(card => card.enabled !== false);
  }

  getByCategory(category, { includeDisabled = false } = {}) {
    const cards = this.cardsByCategory[category] || [];
    return includeDisabled ? cards : cards.filter(card => card.enabled !== false);
  }

  getById(id) {
    return this.allCards.find(card => card.id === id);
  }

  getEnabledById(id) {
    const card = this.getById(id);
    return card && card.enabled !== false ? card : null;
  }

  isEnabled(id) { return !!this.getEnabledById(id); }

  getByType(typeString, { includeDisabled = false } = {}) {
    const source = includeDisabled ? this.allCards : this.enabledCards;
    return source.filter(card => card.type.toLowerCase().includes(typeString.toLowerCase()));
  }
}

export const cardDb = new CardDatabase();
