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
      return this.allCards;

    } catch (error) {
      console.error('[CardDatabase] Fallo la carga de cartas:', error);
      throw error;
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