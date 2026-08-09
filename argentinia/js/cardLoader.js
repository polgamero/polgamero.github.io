// js/cardLoader.js

const DATA_FILES = {
  tierras: './assets/data/tierras.json',
  artefactos: './assets/data/artefactos.json',
  criaturas: './assets/data/criaturas.json',
  instantaneos: './assets/data/instantaneos.json',
  conjuros: './assets/data/conjuros.json',
  encantamientos: './assets/data/encantamientos.json'
};

class CardDatabase {
  constructor() {
    this.cardsByCategory = {};
    this.allCards = [];
    this.isLoaded = false;
  }

  async loadAll() {
    try {
      const keys = Object.keys(DATA_FILES);
      const fetchPromises = keys.map(key => 
        fetch(DATA_FILES[key]).then(response => {
          if (!response.ok) {
            throw new Error(`Error al cargar ${DATA_FILES[key]}: ${response.statusText}`);
          }
          return response.json();
        })
      );

      const results = await Promise.all(fetchPromises);

      keys.forEach((key, index) => {
        this.cardsByCategory[key] = results[index];
        this.allCards.push(...results[index]);
      });

      this.isLoaded = true;
      console.log(`[CardDatabase] Carga completa. Total de cartas: ${this.allCards.length}`);

      // No bloquea el arranque del juego (no lleva "await" acá abajo): dispara los chequeos
      // de imagen en paralelo y va completando la tabla en consola a medida que responden.
      this.reportMissingImages();

      return this.allCards;

    } catch (error) {
      console.error('[CardDatabase] Fallo la carga de cartas:', error);
      throw error;
    }
  }

  // Recorre TODAS las cartas cargadas y avisa por consola cuáles todavía no tienen su
  // imagen en /assets/images/cards/ — para no tener que esperar a que te toque esa carta
  // en una partida para enterarte de que le falta el arte.
  async reportMissingImages() {
    const missing = [];

    const checks = this.allCards.map(async (card) => {
      if (!card.image) {
        missing.push({ carta: card.name, id: card.id, problema: 'sin campo "image" en el JSON' });
        return;
      }
      const path = `./assets/images/cards/${card.image}`;
      try {
        const res = await fetch(path, { method: 'HEAD' });
        if (!res.ok) missing.push({ carta: card.name, id: card.id, problema: `falta el archivo: ${card.image}` });
      } catch (e) {
        missing.push({ carta: card.name, id: card.id, problema: `falta el archivo: ${card.image}` });
      }
    });

    await Promise.all(checks);

    if (missing.length > 0) {
      missing.sort((a, b) => a.carta.localeCompare(b.carta));
      console.warn(`[CardDatabase] ${missing.length} carta(s) sin imagen (de ${this.allCards.length} totales):`);
      console.table(missing);
    } else {
      console.log('[CardDatabase] Todas las cartas tienen su imagen. 🎉');
    }
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