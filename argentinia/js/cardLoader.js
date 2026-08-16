// js/cardLoader.js
// ENTREGA 23.8.3 — guardas anti-duplicación / anti-rate-limit.
// IMPORTANTE: el runtime NO hace HEAD/GET masivos para auditar imágenes. La existencia de
// assets se audita offline; en juego, una imagen se solicita únicamente cuando realmente
// se renderiza una carta.

import { POOL_BASELINE } from './poolContract.js';

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
  for (const [category, expected] of Object.entries(POOL_BASELINE.categories)) {
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

  if (allCards.length !== POOL_BASELINE.total) {
    throw poolContractError(
      `Total esperado ${POOL_BASELINE.total}, recibido ${allCards.length}.`,
      { expected: POOL_BASELINE.total, actual: allCards.length, actualCounts }
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
    this.cardsByCategory = {};
    this.allCards = [];
    this.isLoaded = false;
    this.loadPromise = null;
  }

  async loadAll() {
    // Idempotencia fuerte: si boot() o cualquier caller futuro intenta cargar dos veces,
    // JAMÁS se vuelve a hacer push sobre allCards ni se duplica 501 -> 1002.
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
      const response = await fetch(DATA_FILES[key]);
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

    const results = await Promise.all(fetchPromises);

    // Construcción transaccional: no tocamos el estado compartido hasta que las siete
    // categorías estén descargadas y validadas. Una carga parcial jamás contamina el pool.
    const nextByCategory = {};
    const nextAllCards = [];
    keys.forEach((key, index) => {
      nextByCategory[key] = results[index];
      nextAllCards.push(...results[index]);
    });

    const counts = validateLoadedPool(nextByCategory, nextAllCards);

    this.cardsByCategory = nextByCategory;
    this.allCards = nextAllCards;
    this.isLoaded = true;

    console.log(`[CardDatabase] Pool validado: ${this.allCards.length}/${POOL_BASELINE.total} cartas.`, counts);

    // Diagnóstico LOCAL, sin una sola request de red. Sólo avisa si al JSON le falta el
    // nombre del archivo; NO intenta comprobar remotamente 501 imágenes.
    const withoutImageField = this.allCards.filter(card => !card?.image);
    if (withoutImageField.length) {
      console.warn(`[CardDatabase] ${withoutImageField.length} carta(s) sin campo image en JSON. La existencia de archivos se audita offline.`);
    }

    return this.allCards;
  }

  getByCategory(category) {
    return this.cardsByCategory[category] || [];
  }

  getById(id) {
    return this.allCards.find(card => card.id === id);
  }

  getByType(typeString) {
    return this.allCards.filter(card => card.type.toLowerCase().includes(typeString.toLowerCase()));
  }
}

export const cardDb = new CardDatabase();
