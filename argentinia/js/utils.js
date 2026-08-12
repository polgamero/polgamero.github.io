import { cardDb } from './cardLoader.js';
import { PACK_COMMONS, PACK_UNCOMMONS, PACK_LANDS, MYTHIC_CHANCE_IN_RARE_SLOT } from './store.js';

export function shuffle(array) { 
  return array.sort(() => Math.random() - 0.5); 
}

// --- ARMADO DE MAZO "DE VERDAD" ---
// Antes, buildRandomDeck elegía cartas 100% al azar de TODO el pool: mazos de 5 colores,
// sin curva, con manos que muchas veces no tenían nada jugable. Ahora el mazo arranca
// eligiendo una identidad de color real de MTG (mono o un par de guild) y arma tierras y
// hechizos respetando esa identidad, con curva de maná y un piso de criaturas.

const ALL_COLORS = ['W', 'U', 'B', 'R', 'G'];

// Los 10 pares de 2 colores reales de MTG (guilds de Ravnica).
const GUILD_PAIRS = [
  ['W', 'U'], ['U', 'B'], ['B', 'R'], ['R', 'G'], ['G', 'W'],
  ['W', 'B'], ['U', 'R'], ['B', 'G'], ['R', 'W'], ['G', 'U']
];

// Se exportan para que el modal de selección de mazo (ui.js) pueda listar las mismas
// opciones que el generador realmente entiende — una sola fuente de verdad.
export { ALL_COLORS, GUILD_PAIRS };

const MAX_COPIES_SPELL = 4;       // límite de copias de una misma carta no-tierra, como en MTG real
const MAX_COPIES_NONBASIC_LAND = 2;
const NONBASIC_LAND_BUDGET = 6;   // de las 24 tierras, cuántas como máximo son "especiales" (duales, etc.)
const CREATURE_RATIO = 0.55;      // % de los hechizos que apuntamos a que sean criaturas

function pickDeckIdentity() {
  // 70% un par de 2 colores (el mazo "real" más típico), 30% mono-color.
  if (Math.random() < 0.7) {
    return [...GUILD_PAIRS[Math.floor(Math.random() * GUILD_PAIRS.length)]];
  }
  return [ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)]];
}

// Una carta "entra" en la identidad del mazo si todos sus colores están contemplados.
// Las incoloras (colors: []) siempre entran, en cualquier mazo.
function matchesIdentity(card, identity) {
  const cols = card.colors || [];
  if (cols.length === 0) return true;
  return cols.every(c => identity.includes(c));
}

// Las cartas baratas pesan más que las caras, para que el mazo tenga curva y no termine
// siendo puros bombazos de cmc alto que nunca llegás a tirar.
function curveWeight(cmc) {
  return Math.max(1, 7 - (cmc || 0));
}

// Muestreo ponderado por curva, respetando un máximo de copias por carta (como en MTG real).
function weightedSample(pool, count, maxCopies) {
  const remaining = pool.map(card => ({ card, left: maxCopies }));
  const result = [];
  while (result.length < count) {
    const eligible = remaining.filter(r => r.left > 0);
    if (eligible.length === 0) break;
    const totalWeight = eligible.reduce((sum, r) => sum + curveWeight(r.card.cmc), 0);
    let roll = Math.random() * totalWeight;
    let picked = eligible[eligible.length - 1];
    for (const r of eligible) {
      roll -= curveWeight(r.card.cmc);
      if (roll <= 0) { picked = r; break; }
    }
    picked.left -= 1;
    result.push({ ...picked.card });
  }
  return result;
}

function buildSpellSection(identity, targetTotal) {
  const eligible = cardDb.allCards.filter(c => !c.type.includes('Tierra') && matchesIdentity(c, identity));
  const creatures = eligible.filter(c => c.type.includes('Criatura'));
  const others = eligible.filter(c => !c.type.includes('Criatura'));

  const targetCreatures = Math.round(targetTotal * CREATURE_RATIO);
  const targetOthers = targetTotal - targetCreatures;

  let picks = [
    ...weightedSample(creatures, targetCreatures, MAX_COPIES_SPELL),
    ...weightedSample(others, targetOthers, MAX_COPIES_SPELL)
  ];

  // Relleno de seguridad: si la identidad elegida tiene un pool angosto y no llegamos al
  // total pedido, completamos con lo que haya (aflojando el límite de copias).
  if (picks.length < targetTotal && eligible.length > 0) {
    const extra = weightedSample(eligible, targetTotal - picks.length, MAX_COPIES_SPELL * 3);
    picks = [...picks, ...extra];
  }

  return picks;
}

// Cuenta cuántos símbolos de cada color piden los hechizos ya elegidos, para repartir las
// tierras básicas en esa misma proporción (si el mazo casi no usa un color, no le sobran
// tierras de ese color por las dudas).
function countColorPips(cards) {
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  cards.forEach(c => {
    const cost = parseManaCost(c.manaCost);
    ALL_COLORS.forEach(col => pips[col] += cost[col]);
  });
  return pips;
}

function buildLandSection(identity, spellSection, targetTotal) {
  const allLands = cardDb.allCards.filter(c => c.type.includes('Tierra'));
  const basics = allLands.filter(c => c.type.includes('básica') && c.produces && identity.includes(c.produces));

  // Tierras no básicas que producen maná real (duales, "entra girada", etc.) y calzan 100%
  // con la identidad del mazo. Las de utilidad sin maná (ej. Biblioteca Nacional) quedan
  // afuera del armado automático a propósito: restan consistencia, no la suman.
  const nonBasicManaLands = allLands.filter(c => {
    if (c.type.includes('básica')) return false;
    const cols = c.produces ? [c.produces] : (c.producesOptions || []);
    if (cols.length === 0) return false;
    return cols.every(col => identity.includes(col));
  });

  const nonBasicPicks = weightedSample(nonBasicManaLands, Math.min(NONBASIC_LAND_BUDGET, targetTotal), MAX_COPIES_NONBASIC_LAND);
  const basicsNeeded = targetTotal - nonBasicPicks.length;
  let basicPicks = [];

  if (identity.length === 1) {
    const only = basics.filter(b => b.produces === identity[0]);
    for (let i = 0; i < basicsNeeded; i++) {
      if (only.length === 0) break;
      basicPicks.push({ ...only[Math.floor(Math.random() * only.length)] });
    }
  } else {
    // Repartimos las básicas en proporción a cuánto pide cada color en los hechizos elegidos,
    // con un piso del 30% para el color minoritario, para no quedar sin fuente de ese color.
    const pips = countColorPips(spellSection);
    const [colorA, colorB] = identity;
    const totalPips = pips[colorA] + pips[colorB];
    let ratioA = totalPips > 0 ? pips[colorA] / totalPips : 0.5;
    ratioA = Math.min(0.7, Math.max(0.3, ratioA));

    const needA = Math.round(basicsNeeded * ratioA);
    const needB = basicsNeeded - needA;
    const poolA = basics.filter(b => b.produces === colorA);
    const poolB = basics.filter(b => b.produces === colorB);

    for (let i = 0; i < needA; i++) {
      if (poolA.length === 0) break;
      basicPicks.push({ ...poolA[Math.floor(Math.random() * poolA.length)] });
    }
    for (let i = 0; i < needB; i++) {
      if (poolB.length === 0) break;
      basicPicks.push({ ...poolB[Math.floor(Math.random() * poolB.length)] });
    }
  }

  let landPicks = [...nonBasicPicks, ...basicPicks];

  // Relleno de seguridad por si algún color se quedó sin básicas disponibles.
  if (landPicks.length < targetTotal && basics.length > 0) {
    const shortfall = targetTotal - landPicks.length;
    for (let i = 0; i < shortfall; i++) {
      landPicks.push({ ...basics[Math.floor(Math.random() * basics.length)] });
    }
  }

  return landPicks;
}

export function buildRandomDeck(forcedIdentity) {
  const TOTAL_LANDS = 24;
  const TOTAL_SPELLS = 36;

  // Si viene una identidad forzada (el jugador humano la eligió en el modal inicial), la
  // usamos tal cual. Si no (el Tano siempre llama sin argumento), se sortea como siempre.
  const identity = forcedIdentity || pickDeckIdentity();
  console.log(`[buildRandomDeck] Identidad elegida: ${identity.join('/')}`);

  const spellSection = buildSpellSection(identity, TOTAL_SPELLS);
  const landSection = buildLandSection(identity, spellSection, TOTAL_LANDS);

  return shuffle([...landSection, ...spellSection]);
}

export function parseManaCost(manaString) {
  const cost = { W: 0, U: 0, B: 0, R: 0, G: 0, generic: 0 };
  if (!manaString) return cost;
  const matches = manaString.match(/\{[^}]+\}/g);
  if (!matches) return cost;
  matches.forEach(m => {
    const val = m.replace(/[{}]/g, '');
    if (val === 'X') return; // El valor de X se suma aparte, una vez que el jugador lo elige
                              // (no se sabe todavía en este punto — ver confirmXValue en main.js).
    if (['W', 'U', 'B', 'R', 'G'].includes(val)) cost[val] += 1;
    else if (!isNaN(val)) cost.generic += parseInt(val, 10);
  });
  return cost;
}

// Suma dos costos YA PARSEADOS símbolo por símbolo — usado por Kicker para combinar el
// costo base de la carta + el costo adicional opcional del Kicker en un solo total a pagar.
export function sumManaCosts(a, b) {
  return {
    W: (a.W || 0) + (b.W || 0),
    U: (a.U || 0) + (b.U || 0),
    B: (a.B || 0) + (b.B || 0),
    R: (a.R || 0) + (b.R || 0),
    G: (a.G || 0) + (b.G || 0),
    generic: (a.generic || 0) + (b.generic || 0)
  };
}

export function getLandColor(card) {
  if (card && card.produces) return card.produces;
  // Tierras duales (producesOptions): esta función solo puede devolver UN color, así que
  // usamos el primero de la lista como fallback deliberado. Si necesitás los colores
  // completos de una tierra dual, no uses esta función — leé card.producesOptions directo.
  if (card && card.producesOptions && card.producesOptions.length > 0) return card.producesOptions[0];
  
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

// --- FASE 2: SOBRES ---
// Arma el contenido de un sobre — misma estructura que un booster real de MTG (comunes +
// poco comunes + una rara garantizada, con chance de mítica en su lugar + una tierra).
// Puramente aleatorio del lado del cliente: aceptable para un proyecto de este tamaño sin
// backend propio, mismo criterio de confianza que ya usa buildRandomDeck de acá arriba —
// lo que de verdad blinda la compra (que no se pueda pagar dos veces, etc.) es la
// transacción de Firestore en purchasePack (firebaseClient.js), no esto.
function pickRandomCard(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

export function generatePackCards() {
  const byRarity = {
    Common: cardDb.allCards.filter(c => c.rarity === 'Common'),
    Uncommon: cardDb.allCards.filter(c => c.rarity === 'Uncommon'),
    Rare: cardDb.allCards.filter(c => c.rarity === 'Rare'),
    Mythic: cardDb.allCards.filter(c => c.rarity === 'Mythic')
  };
  const lands = cardDb.allCards.filter(c => c.type.includes('Tierra'));

  const cards = [];
  for (let i = 0; i < PACK_COMMONS; i++) cards.push(pickRandomCard(byRarity.Common));
  for (let i = 0; i < PACK_UNCOMMONS; i++) cards.push(pickRandomCard(byRarity.Uncommon));

  const isMythicSlot = byRarity.Mythic.length > 0 && Math.random() < MYTHIC_CHANCE_IN_RARE_SLOT;
  cards.push(pickRandomCard(isMythicSlot ? byRarity.Mythic : byRarity.Rare));

  for (let i = 0; i < PACK_LANDS; i++) cards.push(pickRandomCard(lands));

  return cards; // 15 cartas (objetos de carta completos, no solo IDs)
}
