// js/cardLoader.js

const DATA_FILES = {
  legendarias: './assets/data/legendarias.json',
  raras: './assets/data/raras.json',
  pocoComunes: './assets/data/poco_comunes.json',
  comunes: './assets/data/comunes.json',
  tierras: './assets/data/tierras.json',
  artefactos: './assets/data/artefactos.json'
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