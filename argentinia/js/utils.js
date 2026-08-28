import { isCreaturePermanent, isArtifactPermanent, isLandPermanent } from './permanentTypes.js';
import { cardDb } from './cardLoader.js';
import { resolveReplacementEvent } from './replacementEngine.js';
import { zoneForCardOwner } from './zoneOwnership.js';
import { cardForNonBattlefieldZone } from './transformEngine.js';
import { PACK_COMMONS, PACK_UNCOMMONS, PACK_LANDS, MYTHIC_CHANCE_IN_RARE_SLOT, ENHANCED_SUFFIX, isEnhancementEligibleCard } from './store.js';
import { buildCompetitiveDeck } from './deckIntelligence.js';
import { gameRandom } from './gameRng.js';

export function shuffle(array, randomFn = gameRandom) {
  if (!Array.isArray(array)) return array;
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn('shuffle') * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
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
  // 23.16.4 — una TDFC que abandona el battlefield vuelve a existir como su cara frontal.
  // Esto además elimina el estado de cara/copy-overlay runtime antes de entrar a mano,
  // cementerio o Exilio, sin obligar a cada removal/blink/SBA a conocer Transform Engine.
  destinationZone.push(cardForNonBattlefieldZone(card));
  return true;
}

// Valida el tipo REAL de permanente que puede pagarse como costo de sacrificio.
// Importante: una Criatura Artefacto / Vehículo tripulado puede ser simultáneamente criatura
// y artefacto, por lo que puede satisfacer cualquiera de los dos costos.
export function isSacrificeCandidate(item, eligibleType) {
  if (!item) return false;
  const card = item.card || item;
  if (!card) return false;
  if (eligibleType === 'creature') return isCreaturePermanent(item);
  if (eligibleType === 'artifact') return isArtifactPermanent(item);
  if (eligibleType === 'land') return isLandPermanent(item);
  return false;
}

// Descarte automático al azar sobre una mano REAL. La función acepta randomFn para poder
// regresionarla de forma determinista en Node, pero el juego usa Math.random por defecto.
export function removeRandomCardsFromHand(hand, amount, randomFn = gameRandom) {
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
  // 23.15.9 — una copia de hechizo no es una carta física. Si es contrarrestada
  // simplemente deja de existir al abandonar la Stack; nunca toca Cementerio/Exilio.
  if (stackItem.isCopy) return 'copy_ceased';

  const isLocal = !!stackItem.isLocal;
  // Flashback ya contiene su propio replacement de reglas: si el hechizo fuera a dejar la
  // Stack por cualquier motivo se exilia. Conservamos esa precedencia histórica.
  if (stackItem.castFrom === 'flashback') {
    zoneForCardOwner(stackItem.card, gameState.localExile, gameState.rivalExile, isLocal, gameState.currentMatch?.myRole || null).push(stackItem.card);
    return 'exile';
  }

  // 23.15.5 — un hechizo normal/Escape contrarrestado intenta ir Stack -> Cementerio y
  // atraviesa el mismo Replacement Engine que cualquier otro cambio de zona. Esto permite
  // efectos tipo Rest in Peace sin hardcodear counterspells.
  const result = resolveReplacementEvent(gameState, {
    type:'zone_change', affectedIsLocal:isLocal, targetIsLocal:isLocal,
    card:stackItem.card, targetCard:stackItem.card, item:stackItem, targetItem:stackItem,
    zoneFrom:'stack', zoneTo:'graveyard', cause:'countered'
  });
  const zoneTo = result.event.zoneTo || 'graveyard';
  const destination = zoneTo === 'exile'
    ? zoneForCardOwner(stackItem.card, gameState.localExile, gameState.rivalExile, isLocal, gameState.currentMatch?.myRole || null)
    : zoneForCardOwner(stackItem.card, gameState.localGraveyard, gameState.rivalGraveyard, isLocal, gameState.currentMatch?.myRole || null);
  destination.push(stackItem.card);
  return zoneTo;
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

// --- ARMADO DE MAZO COMPETITIVO 23.17.1 ---
// La UI continúa eligiendo únicamente uno o dos colores. El conocimiento de arquetipos,
// roles, curva, sinergia, manabase y goldfish vive en deckIntelligence.js; utils conserva
// este wrapper retrocompatible para no obligar a gameplay/account bootstrap a conocerlo.

const ALL_COLORS = ['W', 'U', 'B', 'R', 'G'];
const GUILD_PAIRS = [
  ['W', 'U'], ['U', 'B'], ['B', 'R'], ['R', 'G'], ['G', 'W'],
  ['W', 'B'], ['U', 'R'], ['B', 'G'], ['R', 'W'], ['G', 'U']
];
export { ALL_COLORS, GUILD_PAIRS };

function pickDeckIdentity() {
  if (gameRandom('deck_identity_kind') < 0.7) return [...GUILD_PAIRS[Math.floor(gameRandom('deck_identity_pair') * GUILD_PAIRS.length)]];
  return [ALL_COLORS[Math.floor(gameRandom('deck_identity_color') * ALL_COLORS.length)]];
}

let lastRandomDeckReport = null;
export function getLastRandomDeckReport() {
  return lastRandomDeckReport ? JSON.parse(JSON.stringify(lastRandomDeckReport)) : null;
}

// options.quality: starter | competitive | good | strong | elite.
// Sin argumento conserva la firma histórica y devuelve SIEMPRE sólo el array de 60 cartas.
export function buildRandomDeck(forcedIdentity, options = {}) {
  const identity = forcedIdentity || pickDeckIdentity();
  const quality = options.quality || 'competitive';
  const replayRng = options.rng || (() => gameRandom('deck_intelligence'));
  const result = buildCompetitiveDeck(cardDb.allCards, identity, { ...options, quality, rng: replayRng });
  lastRandomDeckReport = result.report;
  // 23.19 — privacidad de juego Solo: el mazo del Tano es información oculta.
  // No imprimir identidad, arquetipo, score ni curva del mazo generado en consola.
  return shuffle(result.deck, replayRng);
}

// FASE 3, ETAPA 4 (revisión): convierte el cardIds guardado de un mazo real ("Mis Mazos")
// en cartas de juego de verdad, listas para barajar y jugar. Clona cada carta con
// {...cardDef} en vez de reusar la misma referencia — mismo criterio que usa Deck Intelligence:
// cada copia necesita ser un objeto DISTINTO, aunque sean 4 copias de la misma
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
      if (isEnhancedSlot && isEnhancementEligibleCard(cardDef)) {
        const keyword = enhancements && enhancements[baseId];
        if (keyword) cloned.keywords = [...(cloned.keywords || []), keyword];
      }
      return cloned;
    })
    .filter(Boolean);
  return shuffle(cards);
}

export function parseManaCost(manaString) {
  const cost = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0 };
  if (!manaString) return cost;
  const matches = manaString.match(/\{[^}]+\}/g);
  if (!matches) return cost;
  matches.forEach(m => {
    const val = m.replace(/[{}]/g, '').toUpperCase();
    if (val === 'X') return; // El valor de X se suma aparte.
    if (['W', 'U', 'B', 'R', 'G', 'C'].includes(val)) { cost[val] += 1; return; }
    if (!isNaN(val)) { cost.generic += parseInt(val, 10); return; }
    const parts = val.split('/').map(x=>x.trim()).filter(Boolean);
    if (parts.length === 2 && parts[1] === 'P' && ['W','U','B','R','G'].includes(parts[0])) {
      if (!Array.isArray(cost.phyrexian)) cost.phyrexian = [];
      cost.phyrexian.push(parts[0]);
      return;
    }
    if (parts.length === 2 && parts.every(x=>['W','U','B','R','G','C'].includes(x))) {
      if (!Array.isArray(cost.hybrid)) cost.hybrid = [];
      cost.hybrid.push(parts);
    }
  });
  return cost;
}

// Suma dos costos YA PARSEADOS símbolo por símbolo — usado por Kicker para combinar el
// costo base de la carta + el costo adicional opcional del Kicker en un solo total a pagar.
export function sumManaCosts(a, b) {
  const out = {
    W: (a.W || 0) + (b.W || 0), U: (a.U || 0) + (b.U || 0),
    B: (a.B || 0) + (b.B || 0), R: (a.R || 0) + (b.R || 0),
    G: (a.G || 0) + (b.G || 0), C: (a.C || 0) + (b.C || 0),
    generic: (a.generic || 0) + (b.generic || 0)
  };
  const hybrid=[...(a.hybrid||[]),...(b.hybrid||[])];
  const phyrexian=[...(a.phyrexian||[]),...(b.phyrexian||[])];
  if(hybrid.length) out.hybrid=hybrid;
  if(phyrexian.length) out.phyrexian=phyrexian;
  return out;
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
//     sacrifice: { target:'own_creature'|'own_artifact'|'own_land', amount:1 },
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
    const what = c.sacrifice.target === 'own_artifact' ? 'artefacto' : c.sacrifice.target === 'own_creature' ? 'criatura' : c.sacrifice.target === 'own_land' ? 'tierra' : 'permanente';
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
    const extra=Object.keys(item?.counters||{}).filter(type=>Number(item.counters[type])>0);
    const types=Number(item?.loyalty)>0 ? ['loyalty',...extra] : extra;
    if(types.length) out.push({ item, ownerIsLocal:true, kind:'planeswalker', counterTypes:[...new Set(types)] });
  });
  (Array.isArray(state.rivalPlaneswalkers) ? state.rivalPlaneswalkers : []).forEach(item => {
    const extra=Object.keys(item?.counters||{}).filter(type=>Number(item.counters[type])>0);
    const types=Number(item?.loyalty)>0 ? ['loyalty',...extra] : extra;
    if(types.length) out.push({ item, ownerIsLocal:false, kind:'planeswalker', counterTypes:[...new Set(types)] });
  });

  if (Number(state.localPoison) > 0) out.push({ item: null, ownerIsLocal: true, kind: 'player_poison', counterTypes: ['poison'] });
  if (Number(state.rivalPoison) > 0) out.push({ item: null, ownerIsLocal: false, kind: 'player_poison', counterTypes: ['poison'] });
  return out;
}
