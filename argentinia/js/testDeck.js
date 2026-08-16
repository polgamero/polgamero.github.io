// js/testDeck.js — mazo determinista de laboratorio para forzar Stack multiplayer profunda.
// No se guarda en la cuenta, no usa colección y NO reemplaza la regla de "solo mazos propios":
// es una excepción explícita de QA visible únicamente en el selector multiplayer.
import { cardDb } from './cardLoader.js';

export const MULTIPLAYER_TEST_DECK_NAME = 'Mazo de pruebas';

// El motor roba con deck.pop(). Por eso las dos secuencias se agregan invertidas al final.
// Si NO hacés mulligan, ambos clientes reciben exactamente esta mano inicial:
// 3 islas + Reloj Descompuesto + Silencio de Biblioteca + Pará Ahí + Corta la Bocha.
export const MULTIPLAYER_TEST_OPENING_HAND_DRAW_ORDER = [
  'tier_004', 'tier_004', 'tier_004', 'art_018', 'inst_034', 'inst_080', 'inst_001'
];

// Y los seis robos siguientes están sesgados para que sigan llegando tierras/counters.
export const MULTIPLAYER_TEST_EARLY_DRAW_ORDER = [
  'tier_004', 'inst_003', 'tier_004', 'inst_080', 'tier_004', 'inst_034'
];

const repeat = (id, count) => Array.from({ length: count }, () => id);

// Totales (60): 20 U lands / 8 Negate-like / 8 Dispel-like / 6 Counterspell-like /
// 6 Stifle-like / 4 trigger artifacts / 4 cheap ETB creatures / 4 trigger enchantments.
// Restamos de los bloques "rest" las cartas ya reservadas para mano/robos tempranos.
const rest = [
  ...repeat('tier_004', 14),
  ...repeat('inst_003', 7),
  ...repeat('inst_080', 6),
  ...repeat('inst_001', 5),
  ...repeat('inst_034', 4),
  ...repeat('art_018', 3),
  ...repeat('crea_002', 4),
  ...repeat('ench_026', 4)
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
