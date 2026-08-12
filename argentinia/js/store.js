// js/store.js
//
// Fase 2 del multiplayer: números y reglas de la economía del juego, todos en un solo
// lugar a propósito — así se puede reajustar el balance sin tener que cazar constantes
// desperdigadas por main.js/ui.js/turnManager.js. Nada de acá toca el DOM ni Firebase
// directamente; son solo datos y funciones puras.

export const POINTS = {
  winVsTanoFacil: 50,
  winVsTanoDificil: 100,
  lossVsTano: 15,
  // Todavía no hay PvP (esa es la Fase 5 en adelante) — quedan definidos desde ya para no
  // tener que volver a esta charla de balance más adelante.
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

// --- Sobres ---
export const PACK_COST = 150;
// Misma estructura que un booster real de MTG: 9 comunes + 4 poco comunes + 1 rara
// (garantizada, con chance de salir mítica en su lugar) + 1 tierra = 15 cartas + 1 Ficha.
export const PACK_COMMONS = 9;
export const PACK_UNCOMMONS = 4;
export const PACK_LANDS = 1;
export const MYTHIC_CHANCE_IN_RARE_SLOT = 1 / 7;

// --- Fichas ---
export const FICHAS_PER_ENHANCEMENT = 3;

// Lista curada de keywords para la mejora permanente por Fichas — deja afuera a propósito
// lo más rompedor (Indestructible, Ward alto): es un premio de colección divertido, no un
// multiplicador de poder sin techo. Cada carta (por ID) solo se puede mejorar una vez.
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

// --- Reglas de armado de mazo (Fase 3, Etapa 3) ---
// Respetan las reglas oficiales de constructed de MTG, con UNA excepción de diseño
// explícita: acá el tamaño de mazo es un límite RÍGIDO de 60 (ni más ni menos), no "60 o
// más" como en el reglamento real — así lo pidió el usuario. El máximo de copias iguales
// SÍ es 100% el oficial (regla 100.2a): 4 copias de cualquier carta que no sea Tierra
// básica — las básicas no tienen límite, ni acá ni en MTG real.
//
// La colección (lo que te toca en los sobres) NUNCA tiene límite de copias — eso es
// intencional y no cambia con esto: los topes de acá abajo solo aplican al ARMAR un mazo,
// no a cuánto podés juntar.
//
// Estos números son justo los que en algún momento va a poder tocar el panel de Admin
// (todavía no existe, queda anotado para cuando lo armemos) — por eso viven centralizados
// acá, no hardcodeados sueltos por ui.js/firebaseClient.js.
export const DECK_SIZE_EXACT = 60;
export const MAX_COPIES_PER_CARD = 4; // no aplica a Tierras básicas (sin límite, como en MTG real)
