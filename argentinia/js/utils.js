import { cardDb } from './cardLoader.js';

export function shuffle(array) { 
  return array.sort(() => Math.random() - 0.5); 
}

export function buildRandomDeck() {
  const landsPool = cardDb.allCards.filter(c => c.type.includes('Tierra'));
  const spellsPool = cardDb.allCards.filter(c => !c.type.includes('Tierra'));

  const deck = [];
  const TOTAL_LANDS = 24; 
  const TOTAL_SPELLS = 36;

  for (let i = 0; i < TOTAL_LANDS; i++) {
    if (landsPool.length === 0) break; 
    const randomLand = landsPool[Math.floor(Math.random() * landsPool.length)];
    deck.push({ ...randomLand }); 
  }

  for (let i = 0; i < TOTAL_SPELLS; i++) {
    if (spellsPool.length === 0) break;
    const randomSpell = spellsPool[Math.floor(Math.random() * spellsPool.length)];
    deck.push({ ...randomSpell });
  }

  return shuffle(deck);
}

export function parseManaCost(manaString) {
  const cost = { W: 0, U: 0, B: 0, R: 0, G: 0, generic: 0 };
  if (!manaString) return cost;
  const matches = manaString.match(/\{[^}]+\}/g);
  if (!matches) return cost;
  matches.forEach(m => {
    const val = m.replace(/[{}]/g, '');
    if (['W', 'U', 'B', 'R', 'G'].includes(val)) cost[val] += 1;
    else if (!isNaN(val)) cost.generic += parseInt(val, 10);
  });
  return cost;
}

export function getLandColor(card) {
  if (card && card.produces) return card.produces;
  
  const cardType = card?.type || '';
  if (cardType.includes('Agua')) return 'U';
  if (cardType.includes('Planicie')) return 'W';
  if (cardType.includes('Pantano')) return 'B';
  if (cardType.includes('Montaña')) return 'R';
  if (cardType.includes('Bosque')) return 'G';

  const cardText = card && card.text;
  if (!cardText) return 'generic';
  if (cardText.includes('{W}')) return 'W';
  if (cardText.includes('{U}')) return 'U';
  if (cardText.includes('{B}')) return 'B';
  if (cardText.includes('{R}')) return 'R';
  if (cardText.includes('{G}')) return 'G';
  return 'generic';
}

export function sleep(ms) { 
  return new Promise(resolve => setTimeout(resolve, ms)); 
}
