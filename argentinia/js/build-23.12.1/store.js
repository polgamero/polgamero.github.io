// js/store.js
//
// Números y reglas de la economía/balance del juego, todos en un solo lugar a propósito —
// así se puede reajustar sin cazar constantes desperdigadas por main.js/ui.js/
// turnManager.js/firebaseClient.js. Nada de acá toca el DOM ni Firebase directamente; son
// solo datos y funciones puras.
//
// PANEL DE ADMIN: los valores marcados como "admin-editable" abajo son `let`, no `const` —
// a propósito, porque applyGameConfig() (al final del archivo) los reasigna en tiempo real
// cuando se carga la configuración guardada en Firestore. Los módulos que los importan
// (`import { PACK_COST } from './store.js'`) siempre ven el valor ACTUAL gracias a cómo
// funcionan los bindings de ES modules — no hace falta recargar la página ni volver a
// importar nada para que un cambio del Admin impacte de verdad.

export const POINTS = {
  winVsTanoFacil: 50,
  winVsTanoDificil: 100,
  lossVsTano: 15,
  // PvP real desde la Fase 4 (Etapas 1 a 6 del roadmap de sincronización) — ya no es "a
  // futuro", se usan de verdad en cada partida multiplayer que termina.
  winVsHumano: 120,
  lossVsHumano: 20,
  abandonPenalty: -30
};

// Perder siempre da algo (no se castiga animarse a jugar y perder) — pero abandonar es
// estrictamente peor que perder jugando hasta el final. Si no, la jugada "óptima" sería
// cerrar la pestaña apenas vas perdiendo, y es justo lo que no queremos incentivar.
export function pointsForBotGameEnd(won, difficulty) {
  if (won) return difficulty === 'hard' ? POINTS.winVsTanoDificil : POINTS.winVsTanoFacil;
  return POINTS.lossVsTano;
}

// --- Sobres (admin-editable: costo y chance de mítica) ---
export let PACK_COST = 150;
// Misma estructura que un booster real de MTG: 9 comunes + 4 poco comunes + 1 rara
// (garantizada, con chance de salir mítica en su lugar) + 1 tierra = 15 cartas + 1 Ficha.
// La composición fija (9/4/1) no es admin-editable por ahora — solo el costo y la chance de
// mítica, que son los dos números que realmente mueven el balance económico.
export const PACK_COMMONS = 9;
export const PACK_UNCOMMONS = 4;
export const PACK_LANDS = 1;
export let MYTHIC_CHANCE_IN_RARE_SLOT = 1 / 7;

// --- Fichas (admin-editable: costo de craftear) ---
export let FICHAS_PER_ENHANCEMENT = 3;

// Marca, dentro del cardIds de UN mazo guardado, cuál copia puntual es "la mejorada" — como
// la colección es solo un array de IDs repetidos (sin identidad individual por copia), esto
// es lo que permite elegir/reconocer ESA copia en particular al armar el mazo y en el juego,
// sin tener que rediseñar toda la colección para darle identidad propia a cada copia. Es un
// detalle técnico interno, NO es admin-editable.
export const ENHANCED_SUFFIX = '::enhanced';

// Lista curada de keywords para la mejora permanente por Fichas — deja afuera a propósito
// lo más rompedor (Indestructible, Ward alto): es un premio de colección divertido, no un
// multiplicador de poder sin techo. Cada carta (por ID) solo se puede mejorar una vez. Es
// contenido fijo, no admin-editable (cambiar esta lista es una decisión de diseño de
// contenido, no un ajuste de balance numérico).
export const ENHANCEMENT_KEYWORDS = [
  { key: 'flying', label: 'Vuela' },
  { key: 'trample', label: 'Arrolla' },
  { key: 'vigilance', label: 'Vigilancia' },
  { key: 'haste', label: 'Prisa' },
  { key: 'lifelink', label: 'Vínculo Vital' },
  { key: 'deathtouch', label: 'Toque Mortal' },
  { key: 'firststrike', label: 'Primer Golpe' },
  { key: 'menace', label: 'Amenaza' },
  { key: 'reach', label: 'Alcance' },
  { key: 'hexproof', label: 'Intocable' }
];

// --- Reglas de armado de mazo (admin-editable) ---
// Respetan las reglas oficiales de constructed de MTG, con UNA excepción de diseño
// explícita: acá el tamaño de mazo es un límite RÍGIDO (ni más ni menos), no "60 o más"
// como en el reglamento real — así lo pidió el usuario. El máximo de copias iguales por
// default SÍ es 100% el oficial (regla 100.2a): 4 copias de cualquier carta que no sea
// Tierra básica — las básicas no tienen límite, ni acá ni en MTG real.
//
// La colección (lo que te toca en los sobres) NUNCA tiene límite de copias — eso es
// intencional y no cambia con esto: los topes de acá abajo solo aplican al ARMAR un mazo,
// no a cuánto podés juntar.
export let DECK_SIZE_EXACT = 60;
export let MAX_COPIES_PER_CARD = 4; // no aplica a Tierras básicas (sin límite, como en MTG real)

// Cuántas cartas CON mejora por Fichas podés meter en el mismo mazo, como máximo. Sin este
// tope, un jugador con muchas Fichas podría armar un mazo entero de bombas mejoradas y
// romper el balance del todo — 3 es el default pedido explícitamente.
export let MAX_ENHANCED_CARDS_PER_DECK = 3;

// ============================================================================
// PANEL DE ADMIN: puente entre Firestore y estos valores en memoria.
// ============================================================================

// Forma completa de la configuración editable — se usa tanto para armar el formulario del
// panel de Admin (si Firestore todavía no tiene nada guardado) como para saber qué campos
// existen en total.
export function getDefaultGameConfig() {
  return {
    winVsTanoFacil: 50,
    winVsTanoDificil: 100,
    lossVsTano: 15,
    winVsHumano: 120,
    lossVsHumano: 20,
    abandonPenalty: -30,
    packCost: 150,
    mythicChance: 1 / 7,
    fichasPerEnhancement: 3,
    deckSizeExact: 60,
    maxCopiesPerCard: 4,
    maxEnhancedCardsPerDeck: 3
  };
}

// Aplica una configuración cargada (de Firestore, o del propio panel de Admin al guardar)
// a los valores en memoria de acá arriba — cualquier campo ausente o inválido simplemente
// no se toca, así un documento de config incompleto o corrupto nunca deja al juego en un
// estado roto (los valores no tocados siguen con lo que ya tenían, sea el default
// hardcodeado o lo último cargado con éxito).
export function applyGameConfig(config) {
  if (!config) return;
  if (typeof config.winVsTanoFacil === 'number') POINTS.winVsTanoFacil = config.winVsTanoFacil;
  if (typeof config.winVsTanoDificil === 'number') POINTS.winVsTanoDificil = config.winVsTanoDificil;
  if (typeof config.lossVsTano === 'number') POINTS.lossVsTano = config.lossVsTano;
  if (typeof config.winVsHumano === 'number') POINTS.winVsHumano = config.winVsHumano;
  if (typeof config.lossVsHumano === 'number') POINTS.lossVsHumano = config.lossVsHumano;
  if (typeof config.abandonPenalty === 'number') POINTS.abandonPenalty = config.abandonPenalty;
  if (typeof config.packCost === 'number') PACK_COST = config.packCost;
  if (typeof config.mythicChance === 'number') MYTHIC_CHANCE_IN_RARE_SLOT = config.mythicChance;
  if (typeof config.fichasPerEnhancement === 'number') FICHAS_PER_ENHANCEMENT = config.fichasPerEnhancement;
  if (typeof config.deckSizeExact === 'number') DECK_SIZE_EXACT = config.deckSizeExact;
  if (typeof config.maxCopiesPerCard === 'number') MAX_COPIES_PER_CARD = config.maxCopiesPerCard;
  if (typeof config.maxEnhancedCardsPerDeck === 'number') MAX_ENHANCED_CARDS_PER_DECK = config.maxEnhancedCardsPerDeck;
}
