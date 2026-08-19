import { cardDb } from './cardLoader.js';
import { PACK_COMMONS, PACK_UNCOMMONS, PACK_LANDS, MYTHIC_CHANCE_IN_RARE_SLOT, ENHANCED_SUFFIX } from './store.js';

export function shuffle(array) { 
  return array.sort(() => Math.random() - 0.5); 
}

// Punto 11 pre-500: contrato retrocompatible para habilidades activadas múltiples.
// `activatedAbilities[]` es el formato nuevo; si no existe, la propiedad histórica
// `activatedAbility` se normaliza a una lista de un elemento. Si ambos aparecen, el array
// es autoritativo para evitar duplicar una misma habilidad durante una migración gradual.
export function getActivatedAbilities(card) {
  if (!card) return [];
  if (Array.isArray(card.activatedAbilities)) return card.activatedAbilities.filter(Boolean);
  return card.activatedAbility ? [card.activatedAbility] : [];
}

// Mismo criterio para habilidades prestadas por Equipo. Ningún JSON actual necesita
// `grantedAbilities[]`, pero soportarlo acá evita reconstruir otra excepción el día que un
// Equipo otorgue más de una habilidad activada. `grantedAbility` sigue 100% compatible.
export function getGrantedAbilities(card) {
  if (!card) return [];
  if (Array.isArray(card.grantedAbilities)) return card.grantedAbilities.filter(Boolean);
  return card.grantedAbility ? [card.grantedAbility] : [];
}

// Punto 12 pre-500: timing explícito de habilidades activadas.
// - sin campo: 'legacy' para preservar EXACTAMENTE el comportamiento de las 231 cartas actuales;
// - 'sorcery': propia Main + prioridad + pila vacía;
// - 'instant': cualquier paso/fase donde el controlador tenga prioridad.
// Un valor desconocido es 'invalid' para que un typo futuro no se convierta silenciosamente
// en una habilidad usable con otra regla.
export function getActivatedAbilityTiming(ability) {
  if (!ability || ability.timing === undefined || ability.timing === null || ability.timing === '') return 'legacy';
  if (ability.timing === 'sorcery' || ability.timing === 'instant') return ability.timing;
  return 'invalid';
}

// =========================================================================
// ETAPA MOTOR 1 — helpers de reglas puros (sin DOM / sin Firestore)
// =========================================================================
// Una ficha puede disparar "cuando muere" o "cuando sale del campo", pero una vez que
// abandona el campo deja de existir y NO puede terminar en mano/cementerio/exilio.
// Centralizar esta regla evita que cada removal/rebote/arrase implemente una versión distinta.
export function moveBattlefieldCardToZone(card, destinationZone) {
  if (!card || !Array.isArray(destinationZone)) return false;
  if (card.isToken) return false;
  destinationZone.push(card);
  return true;
}

// Valida el tipo REAL de permanente que puede pagarse como costo de sacrificio.
// Importante: una Criatura Artefacto / Vehículo tripulado puede ser simultáneamente criatura
// y artefacto, por lo que puede satisfacer cualquiera de los dos costos.
export function isSacrificeCandidate(item, eligibleType) {
  if (!item) return false;
  const card = item.card || item;
  if (!card) return false;
  if (eligibleType === 'creature') return card.power !== undefined || !!item.isVehicle;
  if (eligibleType === 'artifact') return typeof card.type === 'string' && card.type.includes('Artefacto');
  return false;
}

// Descarte automático al azar sobre una mano REAL. La función acepta randomFn para poder
// regresionarla de forma determinista en Node, pero el juego usa Math.random por defecto.
export function removeRandomCardsFromHand(hand, amount, randomFn = Math.random) {
  if (!Array.isArray(hand) || amount <= 0) return [];
  const removed = [];
  const n = Math.min(amount, hand.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(randomFn() * hand.length);
    removed.push(hand.splice(idx, 1)[0]);
  }
  return removed;
}


// =========================================================================
// ETAPA MOTOR 2 — destino correcto de objetos contrarrestados
// =========================================================================
// Contrarrestar una HABILIDAD solo la saca de la pila: el permanente que la originó sigue
// donde estaba. Para hechizos, Flashback reemplaza el destino normal por Exilio; Escape y
// los casteos normales vuelven al Cementerio si son contrarrestados.
// Devuelve el destino aplicado para facilitar logs/tests sin duplicar esta regla.
export function moveCounteredStackItemToDestination(stackItem, gameState) {
  if (!stackItem || !stackItem.card || !gameState) return 'none';
  if (stackItem.type === 'ability') return 'ability';

  const isLocal = !!stackItem.isLocal;
  if (stackItem.castFrom === 'flashback') {
    (isLocal ? gameState.localExile : gameState.rivalExile).push(stackItem.card);
    return 'exile';
  }

  (isLocal ? gameState.localGraveyard : gameState.rivalGraveyard).push(stackItem.card);
  return 'graveyard';
}


// =========================================================================
// ETAPA MOTOR 3 — cola local para decisiones remotas
// =========================================================================
// Firestore mantiene UN único buzón público (`pendingDecision`/`decisionResponse`) por
// compatibilidad con el protocolo existente. La serialización ocurre ACÁ, antes de publicar:
// si varios triggers síncronos piden decisiones al rival en el mismo evento (por ejemplo,
// tres descartes forzados), sólo la primera pregunta ocupa el buzón. Las demás esperan en
// memoria y se publican estrictamente una por una cuando llega la respuesta anterior.
//
// El helper es deliberadamente agnóstico de DOM/Firestore/state: producción le inyecta
// onActivate/onIdle, y los tests pueden verificar orden/correlación sin simular la red.
export function createRemoteDecisionQueue({ onActivate = () => {}, onIdle = () => {} } = {}) {
  const waiting = [];
  let active = null;

  function pump() {
    if (active || waiting.length === 0) {
      if (!active && waiting.length === 0) onIdle();
      return;
    }
    active = waiting.shift();
    onActivate(active.request);
  }

  function enqueue(request) {
    if (!request || !request.requestId) {
      return Promise.reject(new Error('Una decisión remota necesita requestId.'));
    }
    return new Promise(resolve => {
      waiting.push({ request, resolve });
      pump();
    });
  }

  // Devuelve false ante una respuesta vieja/ajena. Nunca avanza la cola por un requestId
  // que no corresponde al pedido ACTIVO: esa correlación es la barrera contra ecos de sync.
  function resolveResponse(response) {
    if (!active || !response || response.requestId !== active.request.requestId) return false;

    const completed = active;
    active = null;

    // Activamos la siguiente ANTES de resolver la Promise anterior. Así, si el `.then()`
    // del efecto completado hace render(), jamás deja el canal publicado en un estado vacío
    // intermedio mientras todavía quedan decisiones esperando.
    if (waiting.length > 0) pump();
    else onIdle();

    completed.resolve(response);
    return true;
  }

  return {
    enqueue,
    resolveResponse,
    get activeRequest() { return active ? active.request : null; },
    get queuedCount() { return waiting.length; },
    get pendingCount() { return waiting.length + (active ? 1 : 0); }
  };
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

// FASE 3, ETAPA 4 (revisión): convierte el cardIds guardado de un mazo real ("Mis Mazos")
// en cartas de juego de verdad, listas para barajar y jugar. Clona cada carta con
// {...cardDef} en vez de reusar la misma referencia — mismo criterio que weightedSample de
// acá arriba: cada copia necesita ser un objeto DISTINTO, aunque sean 4 copias de la misma
// carta, porque el motor le va a ir pegando estado propio (girada, contadores, etc.) a cada
// instancia por separado.
//
// Si el id trae el sufijo ENHANCED_SUFFIX (la copia puntual mejorada por Fichas), la
// keyword de la mejora se HORNEA directo en el keywords[] de ESA copia clonada, acá mismo,
// antes de que la partida arranque — así el resto del motor (mano, campo, getEffectiveKeywords)
// ni se entera de que existe un sistema de mejoras: para él, esa carta simplemente nació
// con esa keyword de más, en esta única copia. El Tano nunca pasa por acá (su mazo siempre
// sale de buildRandomDeck), así que nunca puede terminar con una mejora ajena.
//
// `enhancements` se recibe como PARÁMETRO (el {cardId: keyword} de state.userProfile), en
// vez de importar `state` directo de main.js — a propósito: evita un import circular
// (utils.js -> main.js -> ui.js/firebaseClient.js -> SDK de Firebase) que rompía poder
// importar este archivo de forma aislada, y de paso deja la función más pura y testeable.
export function buildDeckFromCardIds(cardIds, enhancements) {
  const cards = cardIds
    .map(id => {
      const isEnhancedSlot = id.endsWith(ENHANCED_SUFFIX);
      const baseId = isEnhancedSlot ? id.slice(0, -ENHANCED_SUFFIX.length) : id;
      const cardDef = cardDb.getById(baseId);
      if (!cardDef) return null;
      const cloned = { ...cardDef };
      if (isEnhancedSlot) {
        const keyword = enhancements && enhancements[baseId];
        if (keyword) cloned.keywords = [...(cloned.keywords || []), keyword];
      }
      return cloned;
    })
    .filter(Boolean);
  return shuffle(cards);
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
// La compra y el consumo del sobre sí son transacciones Firestore; el contenido aleatorio
// sigue generándose en cliente mientras Argentinia no tenga un backend autoritativo propio.
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

// 23.13.0 — premio final del pase semanal. La elección se hace al ABRIR el item de Mi
// Cofre, no al reclamarlo, para que el cofre pueda guardar una recompensa mítica pendiente
// sin materializar de antemano qué carta tocará.
export function generateGuaranteedMythicCard() {
  const mythics = cardDb.allCards.filter(c => c.rarity === 'Mythic');
  if (!mythics.length) throw new Error('No hay cartas míticas cargadas.');
  return pickRandomCard(mythics);
}

// =========================================================================
// PUNTO 14 PRE-500 — COSTOS COMPUESTOS (retrocompatibles)
// =========================================================================
// El motor histórico ya aceptaba:
//   alternativeCost: { type:'life', amount:N }
//   alternativeCost: { type:'hybrid', manaCost:'{1}', life:N }
//   additionalCost:  { type:'discard', amount:N }
// Punto 14 NO obliga a migrarlos. Los normalizamos al contrato nuevo:
//   {
//     manaCost: '{1}' | null,
//     life: 1,
//     discard: { amount:1, selection:'choice', color:'U' },
//     sacrifice: { target:'own_creature'|'own_artifact', amount:1 },
//     exileFromGraveyard: { amount:2, filter:'any' }
//   }
// Un objeto puede combinar varios componentes. `manaCost:null` significa 0 maná.
export function normalizeCompositeCost(cost) {
  if (!cost || typeof cost !== 'object') return null;

  // Formatos legacy.
  if (cost.type === 'life') {
    return { manaCost: null, life: Math.max(0, Number(cost.amount) || 0), discard: null, sacrifice: null, exileFromGraveyard: null };
  }
  if (cost.type === 'hybrid') {
    return { manaCost: cost.manaCost || null, life: Math.max(0, Number(cost.life) || 0), discard: null, sacrifice: null, exileFromGraveyard: null };
  }
  if (cost.type === 'discard') {
    return {
      manaCost: null,
      life: 0,
      discard: {
        amount: Math.max(0, Math.floor(Number(cost.amount ?? 1) || 0)),
        selection: cost.selection === 'random' ? 'random' : 'choice',
        color: cost.color || null
      },
      sacrifice: null,
      exileFromGraveyard: null
    };
  }
  if (cost.type === 'sacrifice') {
    return {
      manaCost: null, life: 0, discard: null,
      sacrifice: { target: cost.target || null, amount: Math.max(0, Math.floor(Number(cost.amount ?? 1) || 0)) },
      exileFromGraveyard: null
    };
  }
  if (cost.type === 'exile_from_graveyard') {
    return {
      manaCost: null, life: 0, discard: null, sacrifice: null,
      exileFromGraveyard: { amount: Math.max(0, Math.floor(Number(cost.amount ?? 1) || 0)), filter: cost.filter || 'any' }
    };
  }

  const discard = cost.discard && typeof cost.discard === 'object' ? {
    amount: Math.max(0, Math.floor(Number(cost.discard.amount ?? 1) || 0)),
    selection: cost.discard.selection === 'random' ? 'random' : 'choice',
    color: cost.discard.color || null
  } : null;
  const sacrifice = cost.sacrifice && typeof cost.sacrifice === 'object' ? {
    target: cost.sacrifice.target || null,
    amount: Math.max(0, Math.floor(Number(cost.sacrifice.amount ?? 1) || 0))
  } : null;
  const exileFromGraveyard = cost.exileFromGraveyard && typeof cost.exileFromGraveyard === 'object' ? {
    amount: Math.max(0, Math.floor(Number(cost.exileFromGraveyard.amount ?? 1) || 0)),
    filter: cost.exileFromGraveyard.filter || 'any'
  } : null;

  return {
    manaCost: typeof cost.manaCost === 'string' && cost.manaCost.trim() ? cost.manaCost : null,
    life: Math.max(0, Number(cost.life) || 0),
    discard,
    sacrifice,
    exileFromGraveyard
  };
}

export function compositeCostHasNonMana(cost) {
  const c = normalizeCompositeCost(cost);
  return !!(c && (c.life > 0 || (c.discard && c.discard.amount > 0) || (c.sacrifice && c.sacrifice.amount > 0) || (c.exileFromGraveyard && c.exileFromGraveyard.amount > 0)));
}

export function getCompositeCostManaString(cost) {
  return normalizeCompositeCost(cost)?.manaCost || null;
}

export function cardMatchesDiscardCost(card, discardSpec) {
  if (!card || !discardSpec) return false;
  if (discardSpec.color && !(Array.isArray(card.colors) && card.colors.includes(discardSpec.color))) return false;
  return true;
}

export function describeCompositeCost(cost) {
  const c = normalizeCompositeCost(cost);
  if (!c) return '';
  const parts = [];
  if (c.manaCost) parts.push(c.manaCost);
  if (c.life > 0) parts.push(`${c.life} de vida`);
  if (c.discard && c.discard.amount > 0) {
    const colorNames = { W:'blanca', U:'azul', B:'negra', R:'roja', G:'verde' };
    const color = c.discard.color ? ` ${colorNames[c.discard.color] || c.discard.color}` : '';
    parts.push(`descartar ${c.discard.amount} carta${c.discard.amount > 1 ? 's' : ''}${color}`);
  }
  if (c.sacrifice && c.sacrifice.amount > 0) {
    const what = c.sacrifice.target === 'own_artifact' ? 'artefacto' : c.sacrifice.target === 'own_creature' ? 'criatura' : 'permanente';
    parts.push(`sacrificar ${c.sacrifice.amount} ${what}${c.sacrifice.amount > 1 ? 's' : ''}`);
  }
  if (c.exileFromGraveyard && c.exileFromGraveyard.amount > 0) {
    parts.push(`exiliar ${c.exileFromGraveyard.amount} carta${c.exileFromGraveyard.amount > 1 ? 's' : ''} del cementerio`);
  }
  return parts.length ? parts.join(' + ') : '0';
}

export function combineManaCostStrings(...parts) {
  return parts.filter(p => typeof p === 'string' && p.trim()).join('') || null;
}

// ENTREGA 23.7.2 — una sola fuente de verdad para Proliferar. Reglas: puede elegir
// CUALQUIER permanente/jugador que ya tenga uno o más contadores, incluso del rival.
// El motor hoy modela contadores genéricos en `item.counters`, Lealtad separada en PW y
// Veneno en el jugador. Escaneamos todas las zonas de permanentes, no sólo criaturas.
export function getProliferateCandidates(state) {
  const out = [];
  const scanCounterZone = (zone, ownerIsLocal, kind) => {
    (Array.isArray(zone) ? zone : []).forEach(item => {
      const counters = item && item.counters && typeof item.counters === 'object' ? item.counters : null;
      const counterTypes = counters
        ? Object.keys(counters).filter(type => Number(counters[type]) > 0)
        : [];
      if (counterTypes.length > 0) out.push({ item, ownerIsLocal, kind, counterTypes });
    });
  };

  scanCounterZone(state.localCombat, true, 'creature');
  scanCounterZone(state.rivalCombat, false, 'creature');
  scanCounterZone(state.localSupport, true, 'support');
  scanCounterZone(state.rivalSupport, false, 'support');
  scanCounterZone(state.localLands, true, 'land');
  scanCounterZone(state.rivalLands, false, 'land');

  (Array.isArray(state.localPlaneswalkers) ? state.localPlaneswalkers : []).forEach(item => {
    if (Number(item?.loyalty) > 0) out.push({ item, ownerIsLocal: true, kind: 'planeswalker', counterTypes: ['loyalty'] });
  });
  (Array.isArray(state.rivalPlaneswalkers) ? state.rivalPlaneswalkers : []).forEach(item => {
    if (Number(item?.loyalty) > 0) out.push({ item, ownerIsLocal: false, kind: 'planeswalker', counterTypes: ['loyalty'] });
  });

  if (Number(state.localPoison) > 0) out.push({ item: null, ownerIsLocal: true, kind: 'player_poison', counterTypes: ['poison'] });
  if (Number(state.rivalPoison) > 0) out.push({ item: null, ownerIsLocal: false, kind: 'player_poison', counterTypes: ['poison'] });
  return out;
}
