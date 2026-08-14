// js/matchSync.js
//
// Fase 4, Etapa 1: el "traductor" entre el `state` local del motor (roles 'local'/'rival',
// desde la perspectiva de CADA jugador en su propia pantalla) y la forma pública/privada
// que se guarda en Firestore para una partida multiplayer (roles FIJOS 'host'/'guest',
// compartidos entre los dos — un documento no puede tener dos campos que se llamen "local").
//
// Es un módulo PURO a propósito: nada de acá toca Firestore ni el DOM, solo transforma
// objetos. La sincronización de verdad (leer/escribir Firestore, engancharlo al motor) es
// la Etapa 2 en adelante — acá solo construimos y probamos el mapeo, que es la parte más
// fácil de arruinar sin darse cuenta (host y guest tienen que mapear "local" a lados
// OPUESTOS del documento, o cada uno terminaría viéndose a sí mismo como el rival).

// Zonas/campos que le pertenecen a UN jugador (se guardan con el prefijo host/guest en el
// documento público) — corresponden 1 a 1 a estos mismos nombres, con el prefijo
// local/rival, en el `state` del motor.
export const PER_PLAYER_FIELDS = [
  'HP', 'Poison', 'Lands', 'Combat', 'Graveyard', 'Exile', 'Support', 'Planeswalkers',
  'LandPlayedThisTurn', 'AttackersDeclaredThisTurn'
];

// Campos compartidos/globales — no tienen dueño, aparecen una sola vez en el documento
// (no con prefijo host/guest).
export const SHARED_FIELDS = [
  'turnCount', 'phase', 'gameOver', 'consecutivePasses', 'combatDamagePrevented',
  'activeEffects', 'scheduledReturns',
  // Mecanismo GENERAL de decisión remota — ver main.js, requestRivalDecision/
  // handleIncomingDecisionRequest. Excepción DELIBERADA a la regla de abajo (ningún otro
  // pending* viaja): a diferencia de un pendingCrew o un pendingXChoice (que son estado de
  // interacción 100% local, de quien está resolviendo su propia jugada), estos dos
  // son, por diseño, el CANAL DE COMUNICACIÓN en sí entre los dos clientes — sin que
  // viajen por Firestore, no hay forma de que el rival se entere de que hay algo que
  // decidir, ni de que a mí me llegue su respuesta.
  'pendingDecision', 'decisionResponse'
];

// A propósito NO se sincroniza nada MÁS de esto — es estado de interacción puramente LOCAL
// de quien está jugando en ese momento (en qué mitad de un pago está, qué modal tiene
// abierto, qué está eligiendo), o son cosas que ya maneja otro sistema por su cuenta
// (currentUser/userProfile ya viven en Firebase Auth + el perfil de usuario, no en el
// estado de una partida puntual). Ningún OTRO campo pending*, isDiscarding, cardsToDiscard,
// damageModalOpen, botDifficulty, currentUser, userProfile o tappedLandsThisSpell viaja
// por Firestore — quedan 100% locales a la pantalla de quien está resolviendo esa jugada.

export function otherRole(role) {
  return role === 'host' ? 'guest' : 'host';
}

// Traduce MI mitad del `state` local a los campos del documento público, con el prefijo de
// MI rol (host o guest) — listo para guardarse con merge:true sin pisar la mitad del rival
// (eso lo hace la Etapa 2; acá solo se arma el objeto).
//
// FASE 4, ETAPA 4 (ajuste importante): cuando tengo el TURNO ACTIVO (state.activePlayer ===
// 'local'), TAMBIÉN publico la mitad del rival tal como mi cliente la entiende en este
// momento. Es necesario: mis propias acciones en mi turno (daño de combate, un hechizo de
// remoción, etc.) mutan legítimamente state.rivalXxx en mi propio cliente — sin esto, esa
// mutación quedaría invisible para el rival de verdad para siempre (nunca se enteraría de
// que perdió una criatura). Cuando NO tengo el turno activo, nunca toco los campos del
// rival — ahí la autoridad es de ÉL, y publicar mi versión (potencialmente vieja) del
// tablero del rival podría pisarle algo más fresco que él mismo acaba de publicar.
//
// Límite conocido, documentado a propósito en vez de parchado: efectos que necesitan saber
// el CONTENIDO EXACTO de la mano oculta del rival (ej. "el rival descarta una carta al
// azar", "mirá su mano y elegí una") no se pueden resolver bien desde este cliente, porque
// nunca tiene esas cartas reales — solo la cantidad. Whatever resuelva ese caso queda para
// una etapa futura dedicada; acá no se intenta adivinar ni fingir contenido.
export function buildMyPublicPatch(state, myRole) {
  const rivalRole = otherRole(myRole);
  const patch = {};
  const hasAuthority = state.activePlayer === 'local';

  PER_PLAYER_FIELDS.forEach(field => {
    patch[`${myRole}${field}`] = state[`local${field}`];
  });
  // La CANTIDAD de cartas, nunca el contenido — esto es justo lo que hace que la mano
  // quede oculta de verdad (el contenido real vive aparte, ver buildMyPrivatePatch).
  patch[`${myRole}HandCount`] = state.localHand.length;
  patch[`${myRole}DeckCount`] = state.localDeck.length;

  if (hasAuthority) {
    PER_PLAYER_FIELDS.forEach(field => {
      patch[`${rivalRole}${field}`] = state[`rival${field}`];
    });
    patch[`${rivalRole}HandCount`] = state.rivalHand.length;
    patch[`${rivalRole}DeckCount`] = state.rivalDeck.length;
  }

  SHARED_FIELDS.forEach(field => { patch[field] = state[field]; });
  patch.activePlayer = state.activePlayer === 'local' ? myRole : rivalRole;
  patch.priorityPlayer = state.priorityPlayer === 'local' ? myRole : rivalRole;
  // FASE 4, ETAPA 6: quién abandonó, traducido host/guest igual que activePlayer — 'local'
  // (yo abandoné) se guarda como MI rol; 'rival' (el otro abandonó, caso que en la
  // práctica nunca deberíamos publicar nosotros mismos) como el rol del rival; null si
  // nadie abandonó todavía.
  patch.abandonedBy = state.abandonedBy === 'local' ? myRole : (state.abandonedBy === 'rival' ? rivalRole : null);

  return patch;
}

// Extrae SOLO la mitad del RIVAL del documento público (usa MI rol para saber cuál de las
// dos mitades es "la del otro"), traducida a la forma que el motor espera para
// state.rivalXxx — lista para aplicarse directo con Object.assign(state, ...). Nunca toca
// ni devuelve mi propia mitad — esa ya la tengo local, no hace falta traerla de vuelta de
// Firestore después de haberla escrito yo mismo.
export function extractRivalStateFromPublicDoc(publicDoc, myRole) {
  const rivalRole = otherRole(myRole);
  const result = {};

  PER_PLAYER_FIELDS.forEach(field => {
    result[`rival${field}`] = publicDoc[`${rivalRole}${field}`];
  });

  // La mano/mazo del rival NUNCA viajan con contenido acá — eso es privado (ver
  // buildMyPrivatePatch, y la Etapa 5 que audita que así se mantenga). Lo único que hay es
  // la CANTIDAD, así que se arman como arrays de esa longitud (con placeholders, no cartas
  // reales) para que el render() de siempre siga funcionando SIN NINGÚN CAMBIO: ya solo
  // necesita .length/.forEach para dibujar los dorsos de carta, nunca mira el contenido
  // real de la mano/mazo rival — ni siquiera en Solitario.
  const rivalHandCount = publicDoc[`${rivalRole}HandCount`] || 0;
  const rivalDeckCount = publicDoc[`${rivalRole}DeckCount`] || 0;
  result.rivalHand = Array(rivalHandCount).fill(null);
  result.rivalDeck = Array(rivalDeckCount).fill(null);

  return result;
}

// FASE 4, ETAPA 6 (reconexión): extrae MI PROPIA mitad del documento público, traducida de
// vuelta a state.localXxx — necesario cuando recargo la página a mitad de partida: mi
// `state` en memoria se perdió por completo, así que tengo que reconstruirlo desde lo
// último que YO MISMO había publicado. El contenido real de mi mano/mazo NO viene de acá
// (nunca se publicó, a propósito — ver Etapa 5) sino de mi documento privado, ver
// buildMyPrivatePatch/el uso de esto en firebaseClient.js.
export function extractMyStateFromPublicDoc(publicDoc, myRole) {
  const result = {};
  PER_PLAYER_FIELDS.forEach(field => {
    result[`local${field}`] = publicDoc[`${myRole}${field}`];
  });
  return result;
}

// Traduce los campos compartidos/globales del documento público a la forma del motor
// ('local'/'rival' en vez de host/guest) — se aplican tal cual sobre `state`, sin importar
// cuál de los dos clientes los haya escrito la última vez.
export function extractSharedStateFromPublicDoc(publicDoc, myRole) {
  const result = {};
  SHARED_FIELDS.forEach(field => { result[field] = publicDoc[field]; });
  result.activePlayer = publicDoc.activePlayer === myRole ? 'local' : 'rival';
  result.priorityPlayer = publicDoc.priorityPlayer === myRole ? 'local' : 'rival';
  // FASE 4, ETAPA 6: null si nadie abandonó, 'local' si fui YO (no debería pasar — mi
  // propio cliente ya sabe que abandonó sin necesitar leerlo de vuelta), 'rival' si fue el
  // otro jugador — este es el caso real que checkGameOver (main.js) necesita detectar.
  result.abandonedBy = publicDoc.abandonedBy === myRole ? 'local' : (publicDoc.abandonedBy === otherRole(myRole) ? 'rival' : null);
  return result;
}

// Mi mano y mazo de VERDAD (con el contenido completo, no solo la cantidad), listos para
// guardarse en matches/{matchId}/private/{miUid} — el documento que SOLO yo puedo leer (ver
// firestore.rules, Fase 4). No necesita mapeo de rol: es MI documento privado, sin importar
// si soy host o guest en esta partida.
export function buildMyPrivatePatch(state) {
  return {
    hand: state.localHand,
    deck: state.localDeck
  };
}
