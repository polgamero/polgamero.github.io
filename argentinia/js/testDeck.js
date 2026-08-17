// js/testDeck.js — mazo determinista de laboratorio multiplayer.
// Entrega 23.10.1: conserva Loyalty/counters/Cuarentena/Cierre y suma un carril temprano
// para probar Hand/Deck privadas (reveal, opaque, discard, exile y habilidades activadas).
import { cardDb } from './cardLoader.js';

export const MULTIPLAYER_TEST_DECK_NAME = 'Mazo de pruebas';

// deck.pop() roba desde el final, por eso las secuencias se agregan invertidas abajo.
// SIN mulligan, ambas notebooks arrancan exactamente con:
//   Obelisco (W), Monumental (U), Firulais,
//   El Cacique del Barrio, Silencio de Biblioteca, Cuarentena Total y Cierre de Persiana.
export const MULTIPLAYER_TEST_OPENING_HAND_DRAW_ORDER = [
  'tier_002', 'tier_004', 'crea_001', 'pw_001', 'inst_034', 'conj_010', 'inst_057'
];

export const MULTIPLAYER_TEST_EARLY_DRAW_ORDER = [
  // Cierre: segundo Firulais. Después B/W/U/W/U para habilitar rápidamente las tres ramas
  // del laboratorio (privacidad, Loyalty y counters) sin depender del shuffle.
  'crea_001', 'tier_009', 'tier_002', 'tier_004', 'tier_002', 'tier_004',
  // Protocolo privado: mano revelada, mano opaca, top-N del mazo y dos permanentes con habilidad.
  'inst_081', 'inst_085', 'inst_083', 'inst_084', 'crea_210', 'art_044'
];

const repeat = (id, count) => Array.from({ length: count }, () => id);

// Resto: base W/U/B + counters suficientes para fabricar Stack >4 después de las pruebas.
const rest = [
  ...repeat('tier_002', 7),
  ...repeat('tier_004', 7),
  ...repeat('tier_009', 6),
  ...repeat('inst_034', 4),
  ...repeat('inst_001', 4),
  ...repeat('inst_080', 4),
  ...repeat('inst_003', 3),
  'inst_057', 'conj_010', 'pw_001', 'art_018', 'conj_060', 'conj_061'
];

export const MULTIPLAYER_TEST_DECK_CARD_IDS = [
  ...rest,
  ...[...MULTIPLAYER_TEST_EARLY_DRAW_ORDER].reverse(),
  ...[...MULTIPLAYER_TEST_OPENING_HAND_DRAW_ORDER].reverse()
];

export function buildMultiplayerTestDeck() {
  if (MULTIPLAYER_TEST_DECK_CARD_IDS.length !== 60) {
    throw new Error(`Mazo de pruebas inválido: ${MULTIPLAYER_TEST_DECK_CARD_IDS.length}/60 cartas.`);
  }
  return MULTIPLAYER_TEST_DECK_CARD_IDS.map(id => {
    const card = cardDb.getById(id);
    if (!card) throw new Error(`Mazo de pruebas: no existe la carta ${id}.`);
    return { ...card };
  });
}
