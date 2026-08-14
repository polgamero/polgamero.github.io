import { logMsg, els, showGameOverOverlay, render, updateAccountUI } from './ui.js';
import { state, resolveEffectDirect, resolveScheduledReturns, getLocalPlayerName, getRivalName } from './main.js';
import { takeBotPriorityAction } from './bot.js';
import { spellStack, resolveTopStackItem } from './stackManager.js';
import { resolveCombatDamage } from './combatRules.js';
import { hasKeyword } from './keywords.js';
import { awardPoints, clearActiveMatchId } from './firebaseClient.js';
import { pointsForBotGameEnd, POINTS } from './store.js';

export function checkGameOver() {
  // FASE 4, ETAPA 6: gameOver y abandonedBy llegan JUNTOS por sync en el mismo publish
  // cuando el rival abandona (ambos son campos compartidos) — si este chequeo fuera
  // DESPUÉS del guard de "ya terminó" de acá abajo, nunca se llegaría a procesar del lado
  // de quien lo recibe (gameOver ya llegaría en true). Por eso usa su propio guard
  // idempotente (abandonProcessedLocally, puramente de este cliente, nunca se sincroniza)
  // en vez de reusar state.gameOver para eso.
  if (state.abandonedBy === 'rival' && !state.abandonProcessedLocally) {
    state.abandonProcessedLocally = true;
    state.gameOver = true;
    logMsg("🏳️ ¡Tu rival abandonó la partida! Ganaste.");
    showGameOverOverlay(true);
    awardMatchEndPoints(true);
    return;
  }

  if (state.gameOver) return;
  if (state.localHP <= 0) {
    state.gameOver = true; logMsg(`💀 Te quedaste sin HP. ¡Ganó ${getRivalName()}!`); showGameOverOverlay(false);
    awardMatchEndPoints(false);
  } else if (state.rivalHP <= 0) {
    state.gameOver = true; logMsg(`🏆 ¡VICTORIA! Hiciste morder el polvo a ${getRivalName()}.`); showGameOverOverlay(true);
    awardMatchEndPoints(true);
  } else if (state.localPoison >= 10) {
    // Condición de derrota ALTERNATIVA (regla 104.3c): no importa cuánto HP te quede.
    state.gameOver = true; logMsg(`☠️ ¡Te llegaron 10 contadores de Veneno! El Infectar de ${getRivalName()} te venció.`); showGameOverOverlay(false);
    awardMatchEndPoints(false);
  } else if (state.rivalPoison >= 10) {
    state.gameOver = true; logMsg(`☠️ ¡${getRivalName()} llegó a 10 contadores de Veneno! Se murió infectado.`); showGameOverOverlay(true);
    awardMatchEndPoints(true);
  }
}

// FASE 2 (renombrada en la Etapa 6 de la Fase 4: ya no es solo "vs Tano"): le suma (o
// resta) puntos a la cuenta logueada al terminar la partida — contra el Tano O contra un
// rival de verdad, cada cliente premia SOLO su propia cuenta (nunca puede escribir puntos
// en la cuenta de otro jugador — ver firestore.rules, users/{userId} — así que cuando gano
// una partida multiplayer, el que se premia a sí mismo con la victoria es MI cliente; el
// rival, al perder, hace lo mismo del otro lado con su propia derrota). Sin sesión, no hace
// nada — Solitario sin login sigue sin puntos, como siempre. No bloquea nada del cierre de
// partida (el overlay de Fin de Partida ya se mostró arriba, esto pasa "en paralelo" y solo
// actualiza el número una vez que Firestore responde).
function awardMatchEndPoints(won) {
  if (!state.currentUser) return;

  if (state.currentMatch) {
    // FASE 4, ETAPA 6: la partida ya terminó — borro el rastro para que un futuro reload no
    // ofrezca "reconectate" a algo que ya no está en curso. Mejor esfuerzo, no bloquea nada
    // si falla (revisa la próxima vez que arranque igual, ver fetchMatchForReconnect).
    clearActiveMatchId(state.currentUser.uid).catch(() => {});

    const delta = won ? POINTS.winVsHumano : POINTS.lossVsHumano;
    awardPoints(state.currentUser.uid, delta)
      .then(newTotal => {
        if (state.userProfile) state.userProfile.points = newTotal;
        const msg = won
          ? `🪙 ¡Le ganaste a tu rival! Sumaste ${delta} puntos de premio — llevás ${newTotal} en total.`
          : `🪙 Perdiste esta vez, pero te llevás ${delta} puntos de recompensa igual — llevás ${newTotal} en total. ¡Mejor suerte la próxima!`;
        logMsg(msg);
        updateAccountUI(state.currentUser);
      })
      .catch(err => {
        console.error('No se pudieron guardar los puntos de esta partida:', err);
        logMsg("⚠️ No se pudieron guardar los puntos de esta partida — revisá tu conexión.");
      });
    return;
  }

  const delta = pointsForBotGameEnd(won, state.botDifficulty);
  const difficultyLabel = state.botDifficulty === 'hard' ? 'Difícil' : 'Fácil';
  awardPoints(state.currentUser.uid, delta)
    .then(newTotal => {
      if (state.userProfile) state.userProfile.points = newTotal;
      // BUGFIX (revisión post-Fase 3): mensaje más claro sobre qué pasó y por qué, en vez
      // de un genérico "+N puntos" — distingue victoria/derrota y menciona la dificultad,
      // que es justo lo que determina cuánto se ganó.
      const msg = won
        ? `🪙 ¡Le ganaste al Tano en ${difficultyLabel}! Sumaste ${delta} puntos de premio — llevás ${newTotal} en total.`
        : `🪙 Perdiste esta vez, pero te llevás ${delta} puntos de recompensa igual — llevás ${newTotal} en total. ¡Mejor suerte la próxima!`;
      logMsg(msg);
      updateAccountUI(state.currentUser);
    })
    .catch(err => {
      console.error('No se pudieron guardar los puntos de esta partida:', err);
      logMsg("⚠️ No se pudieron guardar los puntos de esta partida — revisá tu conexión.");
    });
}

// SECUENCIA OFICIAL DE PASOS Y FASES MTG
const PHASE_SEQUENCE = [
  'untap',
  'upkeep',
  'draw',
  'main1',
  'combat_begin',
  'combat_attackers',
  'combat_blockers',
  'combat_damage',
  'combat_end',
  'main2',
  'end_step',
  'cleanup'
];

export async function advanceStep() {
  if (state.gameOver) return;

  const currentIdx = PHASE_SEQUENCE.indexOf(state.phase);
  let nextPhase = PHASE_SEQUENCE[(currentIdx + 1) % PHASE_SEQUENCE.length];

  // Si terminamos cleanup, rotamos el jugador activo al siguiente
  if (state.phase === 'cleanup') {
    state.activePlayer = state.activePlayer === 'local' ? 'rival' : 'local';
    state.turnCount = state.activePlayer === 'local' ? state.turnCount + 1 : state.turnCount;
    nextPhase = 'untap';
  }

  // --- Efecto activo: prevenir el combate completo de este jugador (ej. Cuarentena Total) ---
  if (nextPhase === 'combat_begin') {
    const preventIdx = state.activeEffects.findIndex(e => e.effectType === 'prevent_attack' && e.targetPlayer === state.activePlayer);
    if (preventIdx !== -1) {
      const effect = state.activeEffects.splice(preventIdx, 1)[0]; // se consume una sola vez
      logMsg(`🚫 ¡${effect.sourceName} sigue haciendo efecto! ${state.activePlayer === 'local' ? 'No podés' : `${getRivalName()} no puede`} declarar combate este turno.`);
      nextPhase = 'main2'; // Salta directo a la segunda fase principal
    }
  }

  // --- ARREGLO BUG 2: Saltear combate si no hay criaturas viables ---
  if (nextPhase === 'combat_begin') {
    const activeBoard = state.activePlayer === 'local' ? state.localCombat : state.rivalCombat;
    const hasCreatures = activeBoard.some(c => !hasKeyword(c, 'defender'));
    if (!hasCreatures) {
      logMsg(`⏩ Combate omitido automáticamente (sin criaturas para atacar).`);
      nextPhase = 'main2'; // Salta directo a la segunda fase principal
    }
  }

  // --- ARREGLO BUG 4: Saltear bloqueadores y daño si nadie atacó ---
  if (nextPhase === 'combat_blockers') {
    const activeBoard = state.activePlayer === 'local' ? state.localCombat : state.rivalCombat;
    const isAnyoneAttacking = activeBoard.some(c => c.isAttacking);
    if (!isAnyoneAttacking) {
      nextPhase = 'combat_end'; // Salta directo al fin del combate
    }
  }
  
  state.phase = nextPhase;
  state.priorityPlayer = state.activePlayer; // La prioridad vuelve al jugador activo al iniciar cada paso
  state.consecutivePasses = 0;

  // FASE 4, ETAPA 4 — LA PARTE MÁS DELICADA DE TODO EL ROADMAP: si lo que acabamos de armar
  // es el arranque de un turno que ahora le pertenece al RIVAL (nextPhase/state.phase ya es
  // 'untap' porque recién salimos de cleanup, y state.activePlayer YA CAMBIÓ arriba), este
  // cliente NO tiene que seguir procesando el Enderezar de SU tablero — eso mutaría
  // state.rivalXxx solo en MI pantalla. Antes del ajuste de buildMyPublicPatch (matchSync.js)
  // esa mutación se perdía sin publicarse nunca; ahora SÍ se publicaría (por tener yo la
  // autoridad de esta llamada), pero igual NO es donde tiene que pasar: el jugador que recién
  // arranca su turno es quien tiene que enderezar SU PROPIO tablero, no yo adivinándolo por
  // él. Publico el cambio de turno/fase tal cual (render() ya lo hace) y me detengo acá —
  // cuando esto le llegue al cliente del rival por sync, ESE cliente nota que ahora es su
  // turno con fase 'untap' y llama a processMyTurnStart() (ver más abajo, y el listener en
  // main.js). En Solitario (sin currentMatch) esto nunca se activa — sigue siendo el mismo
  // único cliente de siempre, procesando todo de punta a punta sin parar acá.
  if (state.currentMatch && state.phase === 'untap' && state.activePlayer !== 'local') {
    logMsg(`📌 --- Le toca el turno a tu rival. ---`);
    render();
    return;
  }

  logMsg(`📌 --- ${state.activePlayer === 'local' ? 'Tu' : `Turno de ${getRivalName()}`}: Paso de ${getPhaseName(state.phase)} ---`);

  // Lógica de fases automáticas
  if (state.phase === 'untap') {
    executeUntapStep();
    await advanceStep();
    return;
  }

  if (state.phase === 'upkeep') {
    executeUpkeepStep();
    render();
    // En Mantenimiento sí hay prioridad
  }

  if (state.phase === 'draw') {
    executeDrawStep();
    render();
    // En Robo sí hay prioridad
  }

  if (state.phase === 'combat_damage') {
    logMsg("⚔️ Resolviendo daño de combate...");
    resolveCombatDamage();
    render();
  }

  if (state.phase === 'end_step') {
    executeEndStep();
    render();
    // En el Paso Final también hay prioridad
  }

  if (state.phase === 'cleanup') {
    executeCleanupStep();
    return;
  }

  render();

  // Si le toca la prioridad al Tano, le notificamos a su IA (solo en Solitario — en
  // multiplayer, bot.js ya se blinda solo, pero evitamos hasta el setTimeout de más).
  if (!state.currentMatch && state.priorityPlayer === 'rival') {
    setTimeout(takeBotPriorityAction, 600);
  }
}

// FASE 4, ETAPA 4: la contraparte del "me detengo acá" de advanceStep() de arriba — se
// llama desde el cliente del jugador cuyo turno ACABA de empezar (sync trajo
// activePlayer:'local' con phase:'untap', dejado así a propósito por el cliente saliente).
// A diferencia de advanceStep() (que TRANSICIONA hacia la siguiente fase), esto EJECUTA el
// Enderezar en el que este cliente ya está parado, y recién ahí sigue de largo hacia
// Mantenimiento — porque el Enderezar nunca tiene ventana de prioridad, ni acá ni en
// Solitario. Si las condiciones no dan (no es mi turno, o la fase ya avanzó), no hace nada:
// es seguro llamarla de más por las dudas, nunca duplica el enderezar.
export async function processMyTurnStart() {
  if (state.gameOver || state.phase !== 'untap' || state.activePlayer !== 'local') return;
  executeUntapStep();
  await advanceStep();
}

// FASE 4, ETAPA 4: reentrancia — evita que una carrera de sincronización (un segundo
// snapshot de Firestore llegando mientras el primero todavía está resolviendo) dispare una
// doble resolución del mismo "ambos pasaron". Es un cinturón de seguridad barato para un
// caso límite genuinamente raro, no una solución completa a condiciones de carrera — el
// modelo de esta Fase ya asume un cliente confiable, no arbitrado por servidor (ver la
// charla de arquitectura al arrancar la Fase 4).
let isResolvingBothPassed = false;

export async function passPriority(player) {
  if (state.gameOver) return;

  // NUEVO: Bloqueo de seguridad si hay que descartar
  if (state.isDiscarding) {
    logMsg("⚠️ Tenés que descartar antes de poder pasar la prioridad.");
    return; 
  }
  
  if (state.priorityPlayer !== player) return;

  logMsg(`💬 ${player === 'local' ? 'Pasaste' : `${getRivalName()} pasó`} prioridad.`);
  state.consecutivePasses++;

  if (state.consecutivePasses >= 2) {
    await resolveBothPassed();
    return;
  }

  // Rotar prioridad al otro jugador
  state.priorityPlayer = state.priorityPlayer === 'local' ? 'rival' : 'local';
  render();

  if (!state.currentMatch && state.priorityPlayer === 'rival') {
    setTimeout(takeBotPriorityAction, 600);
  }
}

// FASE 4, ETAPA 4 — LA PARTE DELICADA: "ambos pasaron, ¿qué pasa ahora?" (resolver la cima
// de la pila, o avanzar de fase) muta estado que puede pertenecer a CUALQUIERA de los dos
// lados (ej. executeUntapStep endereza los permanentes de quien sea el jugador activo, no
// necesariamente los míos) — pero publishMatchState() (Etapa 2) SOLO publica mi propia
// mitad, nunca la del rival. Si yo procesara esto durante el turno del rival, terminaría
// mutando state.rivalXxx solo en MI pantalla, sin publicarlo nunca: el rival de verdad
// jamás vería ese cambio, y su próxima publicación pisaría lo que "vi" acá con lo real.
//
// Por eso: en multiplayer, esto SOLO lo ejecuta el cliente de quien tiene el turno activo
// (state.activePlayer === 'local' para ese cliente) — nunca el no-activo, aunque haya sido
// SU pase el que completó el conteo. Se llama desde dos lugares:
//   1) El final de passPriority() de acá arriba, cuando mi PROPIO pase llega a 2.
//   2) startListeningToMatch() (main.js), cuando lo que se sincronizó desde el rival deja
//      el conteo en 2 Y ahora es mi turno — porque en ese caso nadie más en ESTE cliente
//      iba a disparar esta función si no la separábamos así.
// En Solitario (sin currentMatch) siempre hay autoridad — es el único cliente que existe,
// exactamente el comportamiento de siempre, sin ningún cambio.
export async function resolveBothPassed() {
  if (isResolvingBothPassed) return;
  const hasAuthority = !state.currentMatch || state.activePlayer === 'local';
  if (!hasAuthority) {
    // No es mi turno — no me corresponde resolver. Publico que ya pasé (render() lo hace)
    // y espero: cuando esto le llegue al cliente de quien SÍ tiene el turno activo, esta
    // misma función se vuelve a evaluar ahí, con autoridad real.
    render();
    return;
  }

  isResolvingBothPassed = true;
  try {
    // Si hay algo en la pila y ambos pasaron
    if (spellStack.length > 0) {
      logMsg("⚡ Ambos pasaron prioridad. Resolviendo la cima de la pila...");
      state.consecutivePasses = 0;
      await resolveTopStackItem();
      render();
      if (!state.currentMatch && state.priorityPlayer === 'rival') setTimeout(takeBotPriorityAction, 600);
    } else {
      // Si la pila está vacía y ambos pasaron -> avanzamos de paso
      await advanceStep();
    }
  } finally {
    isResolvingBothPassed = false;
  }
}

function executeUntapStep() {
  const isLocal = state.activePlayer === 'local';
  if (isLocal) {
    state.localLandPlayedThisTurn = false;
    state.localAttackersDeclaredThisTurn = 0;
    state.localLands.forEach(l => l.tapped = false);
    state.localCombat.forEach(c => { c.tapped = false; c.summoningSickness = false; c.isAttacking = false; c.blockingIndex = null; c.damageTaken = 0; c.attackTarget = null; });
    state.localSupport.forEach(s => { s.tapped = false; s.enteredThisTurn = false; });
    state.localPlaneswalkers.forEach(pw => { pw.abilityUsedThisTurn = false; });
  } else {
    state.rivalLandPlayedThisTurn = false;
    state.rivalAttackersDeclaredThisTurn = 0;
    state.rivalLands.forEach(l => l.tapped = false);
    state.rivalCombat.forEach(c => { c.tapped = false; c.summoningSickness = false; c.isAttacking = false; c.blockingIndex = null; c.damageTaken = 0; c.attackTarget = null; });
    state.rivalSupport.forEach(s => { s.tapped = false; s.enteredThisTurn = false; });
    state.rivalPlaneswalkers.forEach(pw => { pw.abilityUsedThisTurn = false; });
  }
  logMsg(`🔄 Permanentes enderezados para ${isLocal ? getLocalPlayerName() : getRivalName()}.`);
}

// Habilidad Disparada por fase (ej. "Al comienzo de tu mantenimiento, ganás 1 vida").
// Simplificación deliberada: se resuelve directo, sin pasar por la pila (igual que
// ya hacían las habilidades activadas sin objetivo antes de esta etapa).
function executeUpkeepStep() {
  const isLocal = state.activePlayer === 'local';
  const supportZone = isLocal ? state.localSupport : state.rivalSupport;
  supportZone.forEach(item => {
    if (item.card.upkeepTrigger) {
      resolveEffectDirect(item.card.upkeepTrigger, item.card.name, isLocal);
    }
  });
}

// Habilidad Disparada por fase con condición opcional (ej. Hinchada Fervorosa: "si atacaste con
// 2 o más criaturas este turno, robás"). Misma simplificación que el resto: resuelve directo,
// sin pasar por la pila.
function executeEndStep() {
  const isLocal = state.activePlayer === 'local';
  const supportZone = isLocal ? state.localSupport : state.rivalSupport;
  const attackersCount = isLocal ? state.localAttackersDeclaredThisTurn : state.rivalAttackersDeclaredThisTurn;

  resolveScheduledReturns(isLocal); // Parpadeo temporal: acá vuelven las que corresponda

  supportZone.forEach(item => {
    const trig = item.card.endStepTrigger;
    if (!trig) return;
    if (trig.condition === 'attacked_with_two_or_more' && attackersCount < 2) return;
    resolveEffectDirect(trig, item.card.name, isLocal);
  });
}

function executeDrawStep() {
  const isLocal = state.activePlayer === 'local';
  if (isLocal) {
    if (state.localDeck.length > 0) {
      state.localHand.push(state.localDeck.pop());
      logMsg(`🃏 Robaste una carta.`);
    } else {
      // Regla real de MTG: intentar robar de una biblioteca vacía es una forma legítima
      // de perder la partida, no un "no pasa nada".
      logMsg(`💀 ¡Intentaste robar de un mazo vacío! Te quedaste sin cartas para seguir jugando.`);
      state.gameOver = true;
      showGameOverOverlay(false);
    }
  } else {
    if (state.rivalDeck.length > 0) {
      state.rivalHand.push(state.rivalDeck.pop());
      logMsg(`🃏 El Tano robó una carta.`);
    } else {
      logMsg(`🏆 ¡El Tano intentó robar de un mazo vacío! Se quedó sin cartas para seguir jugando.`);
      state.gameOver = true;
      showGameOverOverlay(true);
    }
  }
}

function executeCleanupStep() {
  const isLocal = state.activePlayer === 'local';
  
  // Limpiamos el daño residual
  state.localCombat.forEach(c => c.damageTaken = 0);
  state.rivalCombat.forEach(c => c.damageTaken = 0);

  // Trucos de combate "hasta el final del turno" (ej. Fuerza de Toro, A Cubierto) y Fog:
  // todo lo temporal expira acá, en Limpieza.
  state.localCombat.forEach(c => c.tempEffects = []);
  state.rivalCombat.forEach(c => c.tempEffects = []);
  state.combatDamagePrevented = false;

  // LÓGICA NUEVA: Devolver vehículos (y tierras-criatura) a su zona de origen
  const revertVehicles = (combatZone, supportZone, landsZone) => {
    for (let i = combatZone.length - 1; i >= 0; i--) {
      if (combatZone[i].isVehicle) {
        const v = combatZone.splice(i, 1)[0];
        v.isVehicle = false;
        // Le borramos las estadísticas de criatura
        delete v.card.power;
        delete v.card.toughness;
        (v.wasLand ? landsZone : supportZone).push(v);
        v.wasLand = false;
      }
    }
  };

  revertVehicles(state.localCombat, state.localSupport, state.localLands);
  revertVehicles(state.rivalCombat, state.rivalSupport, state.rivalLands);

  // Lógica de descarte habitual...
  if (isLocal) {
    const excess = state.localHand.length - 7;
    if (excess > 0) {
      state.isDiscarding = true;
      state.cardsToDiscard = excess;
      logMsg(`⚠️ Tenés demasiadas cartas. Hacé clic en ${excess} carta(s) para descartar.`);
      render();
      return;
    }
  } else {
    const rivalExcess = state.rivalHand.length - 7;
    for (let i = 0; i < rivalExcess; i++) {
      const randomIndex = Math.floor(Math.random() * state.rivalHand.length);
      const discarded = state.rivalHand.splice(randomIndex, 1)[0];
      state.rivalGraveyard.push(discarded);
      logMsg(`🗑️ El Tano descartó ${discarded.name} por límite de mano.`);
    }
  }

  // Avanzamos turno automáticamente si no requiere descarte interactivo
  advanceStep();
}

export function handleDiscardClick(index) {
  const discardedCard = state.localHand.splice(index, 1)[0];
  state.localGraveyard.push(discardedCard);
  state.cardsToDiscard--;
  
  logMsg(`🗑️ Descartaste ${discardedCard.name}.`);

  if (state.cardsToDiscard <= 0) {
    state.isDiscarding = false;
    advanceStep();
  }
  
  render();
}

export function attemptPassTurn() {
  passPriority('local');
}

export function passTurnToRival() {
  passPriority('local');
}

export function startLocalTurn() {
  state.activePlayer = 'local';
  state.phase = 'untap';
  advanceStep();
}

function getPhaseName(phaseKey) {
  const MAP = {
    untap: 'Enderezar', upkeep: 'Mantenimiento', draw: 'Robo', main1: '1ra Fase Principal',
    combat_begin: 'Inicio de Combate', combat_attackers: 'Declarar Atacantes',
    combat_blockers: 'Declarar Bloqueadores', combat_damage: 'Daño de Combate',
    combat_end: 'Fin de Combate', main2: '2da Fase Principal', end_step: 'Paso Final', cleanup: 'Limpieza'
  };
  return MAP[phaseKey] || phaseKey;
}
