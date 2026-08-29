import { logMsg, els, showGameOverOverlay, showGameRewardStatus, render, updateAccountUI, refreshTurnPriorityHudClock, showUntapLandChoiceModal } from './ui.js';
import { state, queueTriggeredAbilities, buildGenericEventTriggerEntries, dispatchGameEvent, resolveScheduledReturns, getLocalPlayerName, getRivalName, publishMatchState, revertAnimatedLandState, detachEquipmentFrom, sendAurasToGraveyard, expireTemporaryControlEffects, advanceSagaLoreForPrecombatMainPhase, expireExilePlayPermissionsForCleanup, collectSuspendUpkeepTriggers, isMultiplayerInteractionBlocked } from './main.js';
import { takeBotPriorityAction } from './bot.js';
import { spellStack, resolveTopStackItem } from './stackManager.js';
import { resolveCombatDamage, hasPendingCombatDamageContinuation, executeLocalAttack, executeRivalAttack } from './combatRules.js';
import { hasKeyword } from './keywords.js';
import { awardGamePointsOnce, clearActiveMatchId, recordPlayerGameResult, sealMultiplayerOutcome } from './firebaseClient.js';
import { pointsForBotGameEnd, POINTS } from './store.js';
import { recordTelemetryEvent, getTelemetryStatus, refreshFinalTelemetryAfterTerminalEvent } from './telemetry.js';
import { PRIORITY_CLOCK_DURATION_MS, getEffectivePriorityActivity, canPriorityClockRun, getFrozenPriorityRemainingMs } from './priorityUX.js';
import { gameText } from './gameTexts.js';
import { finishSoloRecovery } from './soloRecovery.js';
import { queuePendingGameReward } from './gameRewards.js';
import { clearManaPool, manaPoolTotal, emptyManaPool } from './manaPool.js';
import { getLandUntapLimit, isLandPreventedFromUntapping, scoreLandForUntap } from './landStax.js';
import { isLandPermanent } from './permanentTypes.js';
import { landRulesTextSuppressed } from './landCharacteristics.js';
import { resolveReplacementEvent } from './replacementEngine.js';
import { zoneForCardOwner, cardOwnerIsLocal } from './zoneOwnership.js';
import { resolveUntapAttempt } from './counterEngine.js';
import { botDifficultyLabel } from './botDifficulty.js';
import { gameRandom } from './gameRng.js';

function cleanupDiscardDestination(card,isLocal) {
  const ownerIsLocal=cardOwnerIsLocal(card,!!isLocal,state.currentMatch?.myRole||null);
  const result=resolveReplacementEvent(state,{type:'zone_change',affectedIsLocal:ownerIsLocal,targetIsLocal:ownerIsLocal,card,targetCard:card,zoneFrom:'hand',zoneTo:'graveyard',cause:'cleanup_discard'});
  const zoneTo=result.event.zoneTo || 'graveyard';
  const destination=zoneTo==='exile'
    ? zoneForCardOwner(card,state.localExile,state.rivalExile,!!isLocal,state.currentMatch?.myRole||null)
    : zoneForCardOwner(card,state.localGraveyard,state.rivalGraveyard,!!isLocal,state.currentMatch?.myRole||null);
  return {zoneTo,destination,ownerIsLocal};
}

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
    logMsg(gameText('game.over.abandonWin'));
    showGameOverOverlay(true);
    awardMatchEndPoints(true);
    return;
  }

  if (state.gameOver) return;
  if (state.localHP <= 0) {
    state.gameOver = true; logMsg(gameText('game.over.hpLoss', { rival: getRivalName() })); showGameOverOverlay(false);
    awardMatchEndPoints(false);
  } else if (state.rivalHP <= 0) {
    state.gameOver = true; logMsg(gameText('game.over.hpWin', { rival: getRivalName() })); showGameOverOverlay(true);
    awardMatchEndPoints(true);
  } else if (state.localPoison >= 10) {
    // Condición de derrota ALTERNATIVA (regla 104.3c): no importa cuánto HP te quede.
    state.gameOver = true; logMsg(gameText('game.over.poisonLoss', { rival: getRivalName() })); showGameOverOverlay(false);
    awardMatchEndPoints(false);
  } else if (state.rivalPoison >= 10) {
    state.gameOver = true; logMsg(gameText('game.over.poisonWin', { rival: getRivalName() })); showGameOverOverlay(true);
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
function pvpRewardNotice(result) {
  const limits = result?.limits || {};
  const reason = result?.rewardReason || 'rewarded';
  const awarded = Math.max(0, Number(result?.appliedDelta) || 0);
  if (reason === 'early_abandon') {
    return gameText('game.points.pvpEarlyNoReward', {
      minutes: limits.minRewardMinutes ?? 3,
      turns: limits.minCompletedTurns ?? 4,
      elapsed: ((Number(result?.durationMs) || 0) / 60000).toFixed(1),
      completed: Math.max(0, Number(result?.completedTurns) || 0)
    });
  }
  if (reason === 'pair_limit') {
    return gameText('game.points.pvpPairLimit', { matches: limits.maxRewardedMatchesPerPairDaily ?? 5 });
  }
  if (reason === 'daily_cap') {
    return gameText('game.points.pvpDailyCap', { cap: limits.maxPointsPerDay ?? 1200 });
  }
  if (reason === 'daily_cap_partial') {
    return gameText('game.points.pvpDailyCapPartial', { points: awarded, cap: limits.maxPointsPerDay ?? 1200 });
  }
  return gameText('game.points.pvpRewarded', { points: awarded });
}

function awardMatchEndPoints(won) {
  // 23.13.54 — una partida Solo finalizada deja de ser reanudable inmediatamente, incluso
  // para Gaucho sin login. Guardamos antes su duración efectiva para Stats.
  const soloRecovery = !state.currentMatch ? finishSoloRecovery() : null;
  if (!state.currentUser) return;
  if (!state.currentMatch) showGameRewardStatus(gameText('game.points.botChecking'), 'info');

  const telemetry = getTelemetryStatus();
  const matchId = state.currentMatch?.matchId || '';
  const myRole = state.currentMatch?.myRole || '';
  const receiptId = matchId
    ? `match_${matchId}_${myRole || 'player'}`
    : (soloRecovery?.soloGameId || telemetry.sessionId);
  const mode = state.currentMatch ? 'multiplayer' : 'solo';

  // 23.13.68 — RESULTADO y RECOMPENSA quedan deliberadamente separados. Este receipt de
  // estadísticas se escribe aunque el ledger económico después decida 0 puntos.
  if (receiptId) {
    void recordPlayerGameResult(state.currentUser.uid, {
      sessionId: receiptId,
      mode,
      won: !!won,
      abandoned: false,
      durationMs: soloRecovery?.durationMs ?? telemetry.elapsedMs ?? 0
    }).catch(err => console.warn('No se pudieron registrar las estadísticas de la partida:', err));
  }

  if (state.currentMatch) {
    clearActiveMatchId(state.currentUser.uid)
      .then(() => { if (state.userProfile) state.userProfile.activeMatchId = null; })
      .catch(() => {});
  }

  const delta = state.currentMatch
    ? (won ? POINTS.winVsHumano : POINTS.lossVsHumano)
    : pointsForBotGameEnd(won, state.botDifficulty);
  const difficultyLabel = botDifficultyLabel(state.botDifficulty);

  if (!receiptId) {
    console.error('[GameReward 23.13.68] Fin de partida sin receipt estable; no se acredita para evitar duplicados.');
    logMsg(gameText('game.points.saveError'));
    return;
  }

  const rewardPayload = {
    receiptId,
    baseDelta: delta,
    mode,
    outcome: won ? 'win' : 'loss',
    difficulty: mode === 'solo' ? String(state.botDifficulty || 'medium') : '',
    matchId,
    myRole
  };

  // Durable antes del primer await: un F5 puede reintentar exactamente este settlement.
  queuePendingGameReward(state.currentUser.uid, rewardPayload);
  recordTelemetryEvent('game_reward_queued', {
    receiptId, mode, outcome: won ? 'win' : 'loss', baseDelta: delta,
    difficulty: mode === 'solo' ? String(state.botDifficulty || 'medium') : null,
    matchId: matchId || null
  });

  const settlePromise = state.currentMatch
    ? Promise.resolve()
        // Fuerza a subir gameOver/HP/veneno/abandonedBy antes de sellar evidencia terminal.
        .then(() => publishMatchState({ force: true }))
        .then(() => sealMultiplayerOutcome(matchId))
        .then(() => awardGamePointsOnce(state.currentUser.uid, rewardPayload))
    : awardGamePointsOnce(state.currentUser.uid, rewardPayload);

  settlePromise
    .then(result => {
      const newTotal = result?.total ?? state.userProfile?.points ?? 0;
      const awarded = Math.max(0, Number(result?.appliedDelta) || 0);
      if (state.userProfile) state.userProfile.points = newTotal;
      recordTelemetryEvent('game_reward_settled', {
        receiptId,
        mode,
        outcome: won ? 'win' : 'loss',
        baseDelta: delta,
        appliedDelta: awarded,
        total: newTotal,
        duplicateReceipt: !!result?.duplicate,
        rewardReason: result?.rewardReason || 'rewarded',
        terminalKind: result?.terminalKind || null,
        durationMs: result?.durationMs ?? null,
        completedTurns: result?.completedTurns ?? null,
        pairCountAfter: result?.pairCountAfter ?? null,
        dailyPointsAfter: result?.dailyPointsAfter ?? null
      });

      if (mode === 'multiplayer') {
        const notice = pvpRewardNotice(result);
        const limited = ['early_abandon','pair_limit','daily_cap'].includes(result?.rewardReason);
        showGameRewardStatus(notice, limited ? 'warning' : 'success');
        logMsg(notice);
        if (awarded > 0 && result?.rewardReason !== 'daily_cap_partial') {
          logMsg(won
            ? gameText('game.points.pvpWin', { points: awarded, total: newTotal })
            : gameText('game.points.pvpLoss', { points: awarded, total: newTotal }));
        }
      } else {
        const msg = won
          ? gameText('game.points.botWin', { difficulty: difficultyLabel, points: awarded, total: newTotal })
          : gameText('game.points.botLoss', { points: awarded, total: newTotal });
        showGameRewardStatus(msg, 'success');
        logMsg(msg);
      }
      void refreshFinalTelemetryAfterTerminalEvent('game_reward_settled').catch(()=>{});
      updateAccountUI(state.currentUser);
    })
    .catch(err => {
      console.error('[GameReward 23.13.68] Settlement diferido; queda en cola local:', err);
      recordTelemetryEvent('game_reward_deferred', {
        receiptId,
        mode,
        outcome: won ? 'win' : 'loss',
        baseDelta: delta,
        code: err?.code || err?.name || 'ERROR',
        message: err?.message || String(err)
      }, 'warning');
      showGameRewardStatus(gameText('game.points.deferred'), 'warning');
      logMsg(gameText('game.points.deferred'));
      void refreshFinalTelemetryAfterTerminalEvent('game_reward_deferred').catch(()=>{});
    });
}

// SECUENCIA OFICIAL DE PASOS Y FASES MTG
// 23.15.3 — los triggers que nacen durante Untap no pueden ir a la pila allí.
// Se retienen y se agregan al mismo lote AP/NAP que los triggers de comienzo de Upkeep.
let deferredBeginningPhaseTriggerEntries = [];

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

  const phaseBefore = state.phase;

  // CR 106.4 / 500.5 — el maná no sobrevive al final de NINGÚN paso ni fase. Esto se
  // ejecuta antes de comprometer la transición; aplica a ambos jugadores porque el pool es
  // información pública y estado de reglas, también en multiplayer.
  if (!state.localManaPool) state.localManaPool = emptyManaPool();
  if (!state.rivalManaPool) state.rivalManaPool = emptyManaPool();
  const floatingBefore = manaPoolTotal(state.localManaPool) + manaPoolTotal(state.rivalManaPool);
  if (floatingBefore > 0) {
    clearManaPool(state.localManaPool);
    clearManaPool(state.rivalManaPool);
    logMsg(gameText('mana.pool.emptied'));
    recordTelemetryEvent('mana_pools_emptied', { phase: phaseBefore, total: floatingBefore });
  }

  const activeBefore = state.activePlayer;
  const turnBefore = state.turnCount;
  recordTelemetryEvent('advance_step_requested', {
    turnCount: turnBefore,
    phase: phaseBefore,
    activePlayer: activeBefore
  });

  const currentIdx = PHASE_SEQUENCE.indexOf(state.phase);
  let nextPhase = PHASE_SEQUENCE[(currentIdx + 1) % PHASE_SEQUENCE.length];

  // Prevention shields temporales ("previene los próximos N daños") expiran en Cleanup
  // aunque no hayan llegado a consumirse por completo.
  if (state.phase === 'cleanup') {
    state.activeEffects = (state.activeEffects || []).filter(effect => !(effect.effectType === 'prevent_damage' && effect.expiresAtCleanup !== false));
  }

  // Si terminamos cleanup, rotamos el jugador activo al siguiente
  if (state.phase === 'cleanup') {
    state.activePlayer = state.activePlayer === 'local' ? 'rival' : 'local';
    // ENTREGA 23.7 — el contador representa TURNOS globales, no "mis turnos". En
    // multiplayer cada notebook ve a sí misma como `local`; la lógica vieja incrementaba
    // sólo si el jugador NUEVO era local, condición que nunca se cumplía en el cliente que
    // estaba entregando el turno. Resultado real observado: una partida entera clavada en 1.
    state.turnCount += 1;
    nextPhase = 'untap';
  }

  // 23.9.3: una restricción por criatura se ARMA únicamente cuando llega el próximo
  // combate de su controlador, nunca retroactivamente si fue creada durante ese mismo turno.
  // Si el objeto ya no existe (murió, rebotó, blink, etc.), se descarta la restricción.
  if (nextPhase === 'combat_begin') {
    const targetBoard = state.activePlayer === 'local' ? state.localCombat : state.rivalCombat;
    state.activeEffects = (state.activeEffects || []).filter(effect => {
      if (effect.effectType !== 'cant_attack_next_turn' || effect.targetPlayer !== state.activePlayer) return true;
      const targetStillExists = targetBoard.some(unit => unit?._effectObjectId && unit._effectObjectId === effect.targetObjectId);
      if (!targetStillExists) return false;
      if (Number(state.turnCount) > Number(effect.createdTurnCount ?? -1)) effect.appliesThisCombat = true;
      return true;
    });
  }

  // CR 506 — Comienzo de Combate siempre existe, incluso con cero atacantes posibles.
  // Cuarentena Total impide DECLARAR ataques, no borra la ventana de prioridad de comienzo
  // de combate. Se consume al intentar pasar de combat_begin a declarar atacantes.
  if (state.phase === 'combat_begin' && nextPhase === 'combat_attackers') {
    const preventIdx = state.activeEffects.findIndex(e => e.effectType === 'prevent_attack' && e.targetPlayer === state.activePlayer);
    if (preventIdx !== -1) {
      const effect = state.activeEffects.splice(preventIdx, 1)[0];
      logMsg(gameText('game.combat.prevented', { source: effect.sourceName, player: state.activePlayer === 'local' ? 'No podés' : `${getRivalName()} no puede` }));
      nextPhase = 'combat_end';
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

  // La restricción por criatura dura exactamente ese próximo combate. Se consume al salir
  // del combate, o inmediatamente si otro efecto global hizo que combat_begin saltara a main2.
  const combatWasSkippedToMain2 = phaseBefore === 'main1' && nextPhase === 'main2';
  const leavingCombat = phaseBefore === 'combat_end' && nextPhase === 'main2';
  if (combatWasSkippedToMain2 || leavingCombat) {
    state.activeEffects = (state.activeEffects || []).filter(effect => !(
      effect.effectType === 'cant_attack_next_turn' &&
      effect.targetPlayer === state.activePlayer &&
      effect.appliesThisCombat === true
    ));
  }
  
  state.phase = nextPhase;
  state.priorityPlayer = state.activePlayer; // La prioridad vuelve al jugador activo al iniciar cada paso
  state.consecutivePasses = 0;
  resetPriorityClock('phase_change');
  recordTelemetryEvent('phase_committed', {
    from: { turnCount: turnBefore, phase: phaseBefore, activePlayer: activeBefore },
    to: { turnCount: state.turnCount, phase: state.phase, activePlayer: state.activePlayer },
    priorityPlayer: state.priorityPlayer
  });

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
    logMsg(gameText('game.turn.rival'));
    render();
    return;
  }

  logMsg(gameText('game.turn.step', { owner: state.activePlayer === 'local' ? 'Tu' : `Turno de ${getRivalName()}`, phase: getPhaseName(state.phase) }));

  // Sagas: acción de turno al comenzar la primera fase principal, antes de prioridad.
  if (state.phase === 'main1') {
    await advanceSagaLoreForPrecombatMainPhase(state.activePlayer === 'local');
  }

  // Lógica de fases automáticas
  if (state.phase === 'combat_begin') {
    const isLocal = state.activePlayer === 'local';
    queueTriggeredAbilities(buildGenericEventTriggerEntries({
      type:'combat_started', controllerIsLocal:isLocal, actorIsLocal:isLocal,
      activePlayerIsLocal:isLocal, phase:'combat_begin', cause:'phase_begin'
    }));
  }

  if (state.phase === 'untap') {
    await executeUntapStep();
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
    logMsg(gameText('game.combat.resolving'));
    // BUGFIX: faltaba este await — resolveCombatDamage() es async y tiene una pausa real
    // adentro (el modal de asignación de daño de Arrollar, cuando hay más de un
    // bloqueador). Sin el await, esta función seguía de largo (y render() corría) mientras
    // la resolución de combate podía seguir en curso en el fondo — arriesgaba que se
    // avanzara de fase, o que otra acción se disparara, antes de que el combate hubiera
    // terminado de verdad.
    await resolveCombatDamage();
    render();
  }

  if (state.phase === 'end_step') {
    executeEndStep();
    render();
    // En el Paso Final también hay prioridad
  }

  if (state.phase === 'cleanup') {
    // BUGFIX: faltaba este await — ver el comentario dentro de executeCleanupStep() para
    // el detalle completo del riesgo que esto cerraba.
    await executeCleanupStep();
    return;
  }

  render();

  // Si le toca la prioridad al Tano, le notificamos a su IA (solo en Solitario — en
  // multiplayer, bot.js ya se blinda solo, pero evitamos hasta el setTimeout de más).
  if (!state.currentMatch && state.priorityPlayer === 'rival') {
    scheduleSoloBotPriority(600);
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
  await executeUntapStep();
  await advanceStep();
}

// FASE 4, ETAPA 4: reentrancia — evita que una carrera de sincronización (un segundo
// snapshot de Firestore llegando mientras el primero todavía está resolviendo) dispare una
// doble resolución del mismo "ambos pasaron". Es un cinturón de seguridad barato para un
// caso límite genuinamente raro, no una solución completa a condiciones de carrera — el
// modelo de esta Fase ya asume un cliente confiable, no arbitrado por servidor (ver la
// charla de arquitectura al arrancar la Fase 4).
let isResolvingBothPassed = false;


// ---------------------------------------------------------------------------
// ENTREGA 23.9 — RELOJ DE PRIORIDAD MULTIPLAYER
// ---------------------------------------------------------------------------
let priorityClockLastAutoPassSerial = null;
let priorityClockLastActivity = null;
let priorityClockWasBlocked = true;
let priorityClockTickBusy = false;

export function resetPriorityClock(reason = 'priority_window', options = {}) {
  if (!state.currentMatch || state.gameOver) return false;
  const durationMs = Math.max(1000, Number(options.durationMs || state.priorityClockDurationMs || PRIORITY_CLOCK_DURATION_MS));
  state.priorityClockDurationMs = durationMs;
  state.priorityClockSerial = Math.max(0, Number(state.priorityClockSerial) || 0) + 1;
  state.priorityClockDeadlineLocalMs = Date.now() + durationMs;
  state.priorityClockRemainingMs = durationMs;
  state.priorityClockPausedLocal = false;
  state.priorityClockPauseReasonLocal = null;
  state.priorityActivity = null;
  priorityClockLastAutoPassSerial = null;
  priorityClockLastActivity = null;
  priorityClockWasBlocked = false;
  recordTelemetryEvent(options.telemetryType || 'priority_clock_start', {
    serial: state.priorityClockSerial,
    durationMs,
    reason,
    turnCount: state.turnCount,
    phase: state.phase,
    activePlayer: state.activePlayer,
    priorityPlayer: state.priorityPlayer,
    stackDepth: spellStack.length
  });
  return true;
}

export function syncPriorityClockFromNetwork({ serial, durationMs, receivedAtClientMs, source = 'remote_sync', serverCommittedAtMs = null } = {}) {
  const nextSerial = Number(serial);
  if (!state.currentMatch || !Number.isFinite(nextSerial)) return false;
  const duration = Math.max(1000, Number(durationMs) || PRIORITY_CLOCK_DURATION_MS);
  // Usamos el instante de RECEPCIÓN del write confirmado como ancla local. Así no dependemos
  // de que los dos Windows tengan el reloj de pared sincronizado. Ambos reciben el mismo
  // commit y quedan normalmente separados sólo por la latencia de escucha.
  const now = Number(receivedAtClientMs) || Date.now();
  const activityAtSync = getEffectivePriorityActivity(state);
  const preservePaused = !!state.priorityClockPausedLocal && !!activityAtSync;
  const preservedRemaining = Math.max(0, Math.min(duration, Number(state.priorityClockRemainingMs) || duration));
  state.priorityClockDurationMs = duration;
  state.priorityClockSerial = nextSerial;
  state.priorityClockRemainingMs = preservePaused ? preservedRemaining : duration;
  state.priorityClockDeadlineLocalMs = now + state.priorityClockRemainingMs;
  state.priorityClockPausedLocal = preservePaused;
  state.priorityClockPauseReasonLocal = preservePaused ? activityAtSync : null;
  priorityClockLastAutoPassSerial = null;
  priorityClockLastActivity = preservePaused ? activityAtSync : null;
  priorityClockWasBlocked = preservePaused;
  recordTelemetryEvent('priority_clock_sync', {
    serial: nextSerial,
    durationMs: duration,
    source,
    serverCommittedAtMs: Number.isFinite(Number(serverCommittedAtMs)) ? Number(serverCommittedAtMs) : null
  });
  refreshTurnPriorityHudClock();
  return true;
}

function pausePriorityClock(activity) {
  const now = Date.now();
  // 23.9.1 FIX: en 23.9 recalculábamos deadline-now CADA 125ms incluso ya pausados.
  // La lógica impedía el auto-pass, pero la mecha seguía consumiéndose visualmente durante
  // descarte/target/pago. Sólo calculamos remaining en la TRANSICIÓN hacia pausa; luego se congela.
  const wasPaused = !!state.priorityClockPausedLocal;
  const remaining = getFrozenPriorityRemainingMs({
    wasPaused,
    remainingMs: state.priorityClockRemainingMs,
    deadlineMs: state.priorityClockDeadlineLocalMs,
    nowMs: now
  });
  state.priorityClockRemainingMs = remaining;
  state.priorityClockPausedLocal = true;
  state.priorityClockPauseReasonLocal = activity || 'blocked';
  if (priorityClockLastActivity !== activity) {
    recordTelemetryEvent('priority_clock_pause', {
      serial: state.priorityClockSerial,
      remainingMs: Math.round(state.priorityClockRemainingMs),
      reason: activity || 'blocked',
      priorityPlayer: state.priorityPlayer
    });
  }
  priorityClockLastActivity = activity;
  priorityClockWasBlocked = true;
}

async function priorityClockTick() {
  if (isMultiplayerInteractionBlocked()) { refreshTurnPriorityHudClock(); return; }
  if (priorityClockTickBusy) return;
  if (!state.currentMatch || state.gameOver || state.multiplayerWaitingForReady) {
    refreshTurnPriorityHudClock();
    return;
  }

  const activity = getEffectivePriorityActivity(state);
  const canRun = canPriorityClockRun(state);
  if (!canRun) {
    pausePriorityClock(activity || ((state.consecutivePasses || 0) >= 2 ? 'resolving' : 'blocked'));
    refreshTurnPriorityHudClock();
    return;
  }

  // Si el dueño local acaba de terminar una acción/selección, arranca una ventana NUEVA
  // completa de 15s. No heredamos los 2 segundos que quizá quedaban antes de elegir target.
  if (priorityClockWasBlocked && state.priorityPlayer === 'local') {
    resetPriorityClock('resume_after_action', { telemetryType: 'priority_clock_reset' });
    render(); // publica serial + priorityActivity=null en el mismo delta normal.
  }
  priorityClockWasBlocked = false;
  priorityClockLastActivity = null;

  if (!Number.isFinite(Number(state.priorityClockDeadlineLocalMs)) || Number(state.priorityClockDeadlineLocalMs) <= 0) {
    // El cliente pasivo espera a recibir el serial del dueño. El dueño puede inicializarlo.
    if (state.priorityPlayer === 'local') {
      resetPriorityClock('missing_deadline');
      render();
    }
    refreshTurnPriorityHudClock();
    return;
  }

  const remaining = Math.max(0, Number(state.priorityClockDeadlineLocalMs) - Date.now());
  state.priorityClockRemainingMs = remaining;
  state.priorityClockPausedLocal = false;
  state.priorityClockPauseReasonLocal = null;
  refreshTurnPriorityHudClock();

  if (remaining > 0 || state.priorityPlayer !== 'local') return;
  if (priorityClockLastAutoPassSerial === state.priorityClockSerial) return;

  priorityClockLastAutoPassSerial = state.priorityClockSerial;
  const timeoutActivity = getEffectivePriorityActivity(state);
  recordTelemetryEvent('priority_timeout_autopass', {
    serial: state.priorityClockSerial,
    turnCount: state.turnCount,
    phase: state.phase,
    activePlayer: state.activePlayer,
    priorityPlayer: state.priorityPlayer,
    stackDepth: spellStack.length,
    activity: timeoutActivity || null
  }, 'warning');
  logMsg(gameText('priority.timeout'));
  priorityClockTickBusy = true;
  try {
    // 23.13.36: un timeout durante una declaración de combate no es un pass abstracto.
    // Confirmamos 0 atacantes / 0 bloqueadores usando el MISMO carril que el botón humano,
    // de modo que la fase pueda avanzar y nadie pause la partida indefinidamente.
    if (timeoutActivity === 'choosing_attackers') await executeLocalAttack();
    else if (timeoutActivity === 'choosing_blockers') executeRivalAttack();
    else await passPriority('local');
  } finally {
    priorityClockTickBusy = false;
  }
}

// DOM-only tick: NO llama render() salvo en transiciones semánticas (reset/timeout), por lo
// que la animación de la mecha jamás genera un write por frame a Firestore.
const priorityClockInterval = setInterval(() => { priorityClockTick().catch(err => console.error('Priority clock tick:', err)); }, 125);
if (priorityClockInterval && typeof priorityClockInterval.unref === 'function') priorityClockInterval.unref();

function scheduleSoloBotPriority(delayMs = 600) {
  if (globalThis.__ARGENTINIA_HEADLESS_ENGINE__ === true) return;
  setTimeout(takeBotPriorityAction, delayMs);
}

export function beginActivePlayerPriorityWindow() {
  if (state.gameOver) return;
  state.priorityPlayer = state.activePlayer;
  state.consecutivePasses = 0;
  resetPriorityClock('active_player_priority_window');
  render();
  if (!state.currentMatch && state.priorityPlayer === 'rival') {
    scheduleSoloBotPriority(600);
  }
}

export async function passPriority(player) {
  if (state.gameOver || isMultiplayerInteractionBlocked()) return;

  // 23.15.1 — las State-Based Actions y sus decisiones reglamentarias ocurren antes de
  // que cualquier jugador reciba prioridad. No aceptar pases mientras el kernel/los
  // selectores de Leyenda/orden de triggers estén estabilizando el estado.
  if (state.pendingLegendChoice || state.pendingTriggerOrderChoice || state.sbaKernelRunning) return;

  // NUEVO: Bloqueo de seguridad si hay que descartar
  if (state.isDiscarding) {
    logMsg(gameText('priority.mustDiscard'));
    return; 
  }
  
  if (state.priorityPlayer !== player) return;

  // ENTREGA 23.7 — invariant duro: una ventana de prioridad tiene como máximo DOS pases
  // consecutivos. Aunque el botón quede visualmente habilitado por latencia/backoff, jamás
  // se acepta un tercer pase. El playtest 23.6 llegó a 30; ahora la corrupción se corta en
  // la frontera de la mutación, no sólo en telemetría después del hecho.
  if ((state.consecutivePasses || 0) >= 2) {
    recordTelemetryEvent('priority_pass_blocked', {
      player,
      turnCount: state.turnCount,
      phase: state.phase,
      activePlayer: state.activePlayer,
      priorityPlayer: state.priorityPlayer,
      consecutivePasses: state.consecutivePasses,
      reason: 'already_two_passes'
    }, 'warning');
    logMsg(gameText('priority.bothPassed.wait'));
    return;
  }

  recordTelemetryEvent('priority_pass', {
    player,
    turnCount: state.turnCount,
    phase: state.phase,
    activePlayer: state.activePlayer,
    priorityPlayer: state.priorityPlayer,
    consecutivePassesBefore: state.consecutivePasses
  });
  logMsg(player === 'local' ? gameText('priority.passed.local') : gameText('priority.passed.rival', { rival: getRivalName() }));
  state.consecutivePasses = Math.min(2, (state.consecutivePasses || 0) + 1);

  if (state.consecutivePasses >= 2) {
    await resolveBothPassed();
    return;
  }

  // Rotar prioridad al otro jugador
  state.priorityPlayer = state.priorityPlayer === 'local' ? 'rival' : 'local';
  state.priorityActivity = null;
  resetPriorityClock('priority_passed');
  render();

  if (!state.currentMatch && state.priorityPlayer === 'rival') {
    scheduleSoloBotPriority(600);
  }
}

// ENTREGA 23.6 — autoridad de resolución multiplayer. "Ambos pasaron" tiene dos casos:
//   1) Stack NO vacía: resuelve el cliente que controla el objeto superior. Ese cliente es
//      el único que posee de verdad sus zonas privadas (mano/mazo) y, durante la resolución,
//      `stackResolutionAuthority` le permite publicar también las mutaciones PÚBLICAS que su
//      propio objeto cause sobre el rival (removal, daño, counter, etc.).
//   2) Stack vacía: avanzar fase/turno sigue siendo responsabilidad del jugador activo.
// El cliente sin autoridad sólo publica su pase y espera el snapshot resultante. En Solitario
// no cambia nada: el único cliente siempre tiene autoridad.
export async function resolveBothPassed() {
  if (isResolvingBothPassed) return;
  const topStackItem = spellStack.length > 0 ? spellStack[spellStack.length - 1] : null;
  // ENTREGA 23.6: con Stack no vacía, la autoridad es el CONTROLADOR del objeto superior.
  // Así cada cliente resuelve sus propios efectos privados (robar, descartar, pagar costos)
  // con sus cartas reales. Con Stack vacía, avanzar fase/turno sigue siendo responsabilidad
  // exclusiva del jugador activo, igual que antes.
  const hasAuthority = !state.currentMatch || (topStackItem ? !!topStackItem.isLocal : state.activePlayer === 'local');
  if (!hasAuthority) {
    // Mi pase puede ser el segundo aunque el objeto superior lo controle el rival. Publico
    // el contador=2 y espero a que el listener del controlador tome la resolución.
    render();
    return;
  }

  isResolvingBothPassed = true;
  let durableResolutionMarkerStarted = false;
  try {
    // 23.19.1 — SAFE-POINT CONTRACT. El cliente que tiene autoridad publica y CONFIRMA
    // primero una marca durable. Si muere/F5 durante cualquier await de la resolución, el
    // reconnect puede distinguir "snapshot estable" de "proceso JS perdido a mitad de efecto".
    if (state.currentMatch) {
      state.multiplayerResolutionMarker = {
        authorityRole: state.currentMatch.myRole,
        kind: topStackItem ? 'stack_resolution' : (state.phase === 'combat_damage' ? 'combat_damage_continuation' : 'step_advance'),
        stackId: topStackItem?.id || null,
        turnCount: Number(state.turnCount || 0),
        phase: state.phase || null,
        startedAtClientMs: Date.now()
      };
      render();
      const markerConfirmed = await publishMatchState({ force:true });
      if (!markerConfirmed) {
        state.multiplayerResolutionMarker = null;
        render();
        return;
      }
      durableResolutionMarkerStarted = true;
      recordTelemetryEvent('multiplayer_resolution_marker_confirmed', {
        kind:state.multiplayerResolutionMarker.kind,
        stackId:state.multiplayerResolutionMarker.stackId,
        turnCount:state.turnCount,
        phase:state.phase
      });
    }

    if (spellStack.length > 0) {
      logMsg(gameText('priority.bothPassed.resolve'));
      state.consecutivePasses = 0;
      state.stackResolutionAuthority = true;
      try {
        await resolveTopStackItem();
        render();
      } finally {
        state.stackResolutionAuthority = false;
      }
      if (!state.currentMatch && state.priorityPlayer === 'rival') scheduleSoloBotPriority(600);
    } else if (state.phase === 'combat_damage' && hasPendingCombatDamageContinuation()) {
      // Trigger Stack: si el daño de iniciativa produjo triggers, el daño regular se pausó
      // hasta que esa pila se vaciara. Ambos vuelven a pasar con Stack vacía => continuar.
      state.consecutivePasses = 0;
      await resolveCombatDamage();
      state.priorityPlayer = state.activePlayer;
      resetPriorityClock('combat_damage_continuation');
      render();
      if (!state.currentMatch && state.priorityPlayer === 'rival') scheduleSoloBotPriority(600);
    } else {
      // Si la pila está vacía y no hay una continuación interna -> avanzamos de paso.
      await advanceStep();
    }
  } finally {
    if (durableResolutionMarkerStarted && state.currentMatch) {
      state.multiplayerResolutionMarker = null;
      render();
      // No abrimos una nueva ventana de juego hasta que el servidor confirme que volvimos
      // a un safe point. Si este ACK falla, 23.19.1 congela input y el recovery watch lo limpia.
      const safePointConfirmed = await publishMatchState({ force:true });
      recordTelemetryEvent(
        safePointConfirmed ? 'multiplayer_resolution_safe_point_confirmed' : 'multiplayer_resolution_safe_point_pending_recovery',
        { turnCount:state.turnCount, phase:state.phase, stackDepth:spellStack.length },
        safePointConfirmed ? 'info' : 'warning'
      );
    } else if (state.multiplayerResolutionMarker?.authorityRole === state.currentMatch?.myRole) {
      state.multiplayerResolutionMarker = null;
      render();
    }
    isResolvingBothPassed = false;
  }
}

async function executeUntapStep() {
  const isLocal = state.activePlayer === 'local';
  const lands = isLocal ? state.localLands : state.rivalLands;
  const combat = isLocal ? state.localCombat : state.rivalCombat;
  const support = isLocal ? state.localSupport : state.rivalSupport;
  const planeswalkers = isLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers;

  // Beginning-of-turn y untap sí pueden disparar habilidades, pero CR no entrega prioridad
  // durante Untap. Construimos ahora los entries y recién los apilamos al comenzar Upkeep.
  deferredBeginningPhaseTriggerEntries = buildGenericEventTriggerEntries({
    type:'turn_started', controllerIsLocal:isLocal, actorIsLocal:isLocal,
    activePlayerIsLocal:isLocal, phase:'untap', cause:'turn_begin'
  });
  const tappedEntries = lands.map((item,index)=>({ item,index })).filter(entry => entry.item.tapped);
  const untappableEntries = tappedEntries.filter(entry => !isLandPreventedFromUntapping(state, entry.item, isLocal));
  const preventedCount = tappedEntries.length - untappableEntries.length;
  const limit = getLandUntapLimit(state, isLocal);
  const allowedCount = Number.isFinite(limit) ? Math.min(limit, untappableEntries.length) : untappableEntries.length;
  let chosenIndexes = untappableEntries.map(entry => entry.index);

  if (allowedCount < untappableEntries.length) {
    if (allowedCount <= 0) {
      chosenIndexes = [];
    } else if (!isLocal) {
      chosenIndexes = untappableEntries
        .slice()
        .sort((a,b)=>scoreLandForUntap(b.item, state, false)-scoreLandForUntap(a.item, state, false) || a.index-b.index)
        .slice(0, allowedCount)
        .map(entry=>entry.index);
    } else {
      state.pendingUntapLandChoice = { count:allowedCount, totalTapped:tappedEntries.length };
      render();
      chosenIndexes = await new Promise(resolve => {
        showUntapLandChoiceModal(untappableEntries, allowedCount, indexes => resolve(indexes));
      });
      state.pendingUntapLandChoice = null;
    }
  }
  const chosen = new Set(chosenIndexes);
  // CR 502 + Stun: primero se determina qué permanentes intentarían enderezarse. Luego,
  // para cada intento, Aturdimiento reemplaza ese enderezar removiendo UN counter. Como no
  // hay prioridad durante Untap, tanto counter_removed como permanent_untapped se difieren a Upkeep.
  const untapAttempts = [
    ...lands.map((item,index) => ({ item, shouldAttempt:!!item?.tapped && chosen.has(index), kind:'land' })),
    ...combat.map(item => ({ item, shouldAttempt:!!item?.tapped, kind:'combat' })),
    ...support.map(item => ({ item, shouldAttempt:!!item?.tapped, kind:'support' })),
    ...planeswalkers.map(item => ({ item, shouldAttempt:!!item?.tapped, kind:'planeswalker' }))
  ].filter(entry => entry.shouldAttempt && entry.item?.card);

  const actualUntapped=[];
  let stunConsumedCount=0;
  for (const { item } of untapAttempts) {
    const result=resolveUntapAttempt(item);
    if(result.stunConsumed){
      stunConsumedCount++;
      deferredBeginningPhaseTriggerEntries.push(...buildGenericEventTriggerEntries({
        type:'counter_removed', controllerIsLocal:isLocal, actorIsLocal:isLocal,
        card:item.card,item,amount:1,zoneFrom:'battlefield',zoneTo:'battlefield',
        cause:'stun_untap_replacement',metadata:{counterType:'stun'}
      }));
      logMsg(gameText('counter.stun.consumed',{card:item.card.name}));
    } else if(result.untapped){
      actualUntapped.push(item);
      deferredBeginningPhaseTriggerEntries.push(...buildGenericEventTriggerEntries({
        type:'permanent_untapped', controllerIsLocal:isLocal, actorIsLocal:isLocal,
        card:item.card,item,zoneFrom:'battlefield',zoneTo:'battlefield',cause:'untap_step'
      }));
    }
  }

  // Reseteos de turno independientes de si Stun reemplazó el enderezar.
  if (isLocal) {
    state.localLandPlayedThisTurn = false;
    state.localAttackersDeclaredThisTurn = 0;
    state.localBlockersDeclaredThisCombat = false;
    state.localLands.forEach(l => { l.enteredThisTurn = false; });
    state.localCombat.forEach(c => { c.enteredThisTurn = false; c.summoningSickness = false; c.isAttacking = false; c.blockingIndex = null; c.damageTaken = 0; c.attackTarget = null; });
    state.localSupport.forEach(s => { s.enteredThisTurn = false; });
    state.localPlaneswalkers.forEach(pw => { pw.abilityUsedThisTurn = false; });
  } else {
    state.rivalLandPlayedThisTurn = false;
    state.rivalAttackersDeclaredThisTurn = 0;
    state.rivalBlockersDeclaredThisCombat = false;
    state.rivalLands.forEach(l => { l.enteredThisTurn = false; });
    state.rivalCombat.forEach(c => { c.enteredThisTurn = false; c.summoningSickness = false; c.isAttacking = false; c.blockingIndex = null; c.damageTaken = 0; c.attackTarget = null; });
    state.rivalSupport.forEach(s => { s.enteredThisTurn = false; });
    state.rivalPlaneswalkers.forEach(pw => { pw.abilityUsedThisTurn = false; });
  }

  if (allowedCount < untappableEntries.length || preventedCount > 0) {
    logMsg(gameText('land.stax.untap.restricted', {
      player:isLocal ? getLocalPlayerName() : getRivalName(), count:chosen.size, total:tappedEntries.length
    }));
    recordTelemetryEvent('land_untap_restricted', {
      player:isLocal?'local':'rival', limit:Number.isFinite(limit)?limit:null,
      tapped:tappedEntries.length, prevented:preventedCount, stunConsumed:stunConsumedCount, untapped:actualUntapped.filter(item=>lands.includes(item)).length
    });
  }
  logMsg(gameText('game.untap', { player: isLocal ? getLocalPlayerName() : getRivalName() }));
}

// Habilidad Disparada por fase (ej. "Al comienzo de tu mantenimiento, ganás 1 vida").
// Simplificación deliberada: se resuelve directo, sin pasar por la pila (igual que
// ya hacían las habilidades activadas sin objetivo antes de esta etapa).
function executeUpkeepStep() {
  const isLocal = state.activePlayer === 'local';
  const combat = isLocal ? state.localCombat : state.rivalCombat;
  const support = isLocal ? state.localSupport : state.rivalSupport;
  const lands = isLocal ? state.localLands : state.rivalLands;
  const planeswalkers = isLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers;
  const entries=[...deferredBeginningPhaseTriggerEntries];
  deferredBeginningPhaseTriggerEntries = [];
  entries.push(...collectSuspendUpkeepTriggers(isLocal));
  entries.push(...[...combat, ...support, ...lands, ...planeswalkers]
    .filter(item => item.card?.upkeepTrigger && !(isLandPermanent(item) && landRulesTextSuppressed(state, item, isLocal)))
    .map(item => ({
      effect: item.card.upkeepTrigger, sourceCard: item.card, sourceItem: item, isLocal,
      triggerType: 'upkeep'
    })));
  entries.push(...buildGenericEventTriggerEntries({
    type:'upkeep_started', controllerIsLocal:isLocal, actorIsLocal:isLocal,
    activePlayerIsLocal:isLocal, phase:'upkeep'
  }));
  queueTriggeredAbilities(entries);
}

// Habilidad Disparada por fase con condición opcional (ej. Hinchada Fervorosa: "si atacaste con
// 2 o más criaturas este turno, robás"). Misma simplificación que el resto: resuelve directo,
// sin pasar por la pila.
function executeEndStep() {
  const isLocal = state.activePlayer === 'local';
  const supportZone = isLocal ? state.localSupport : state.rivalSupport;
  const attackersCount = isLocal ? state.localAttackersDeclaredThisTurn : state.rivalAttackersDeclaredThisTurn;

  resolveScheduledReturns(isLocal); // Parpadeo temporal: acá vuelven las que corresponda

  const entries = [];
  supportZone.forEach(item => {
    const trig = item.card.endStepTrigger;
    if (!trig) return;
    if (trig.condition === 'attacked_with_two_or_more' && attackersCount < 2) return;
    entries.push({ effect: trig, sourceCard: item.card, sourceItem: item, isLocal, triggerType: 'end_step' });
  });
  entries.push(...buildGenericEventTriggerEntries({
    type:'end_step_started', controllerIsLocal:isLocal, actorIsLocal:isLocal,
    activePlayerIsLocal:isLocal, phase:'end_step', metadata:{ attackersDeclaredThisTurn:attackersCount }
  }));
  queueTriggeredAbilities(entries);
}

function executeDrawStep() {
  const isLocal = state.activePlayer === 'local';
  if (isLocal) {
    if (state.localDeck.length > 0) {
      const drawnCard=state.localDeck.pop(); state.localHand.push(drawnCard);
      dispatchGameEvent({type:'card_drawn',controllerIsLocal:true,actorIsLocal:true,ownerIsLocal:true,card:drawnCard,zoneFrom:'library',zoneTo:'hand',cause:'draw_step'});
      logMsg(gameText('game.draw.local'));
    } else {
      // Regla real de MTG: intentar robar de una biblioteca vacía es una forma legítima
      // de perder la partida, no un "no pasa nada".
      logMsg(gameText('game.deckout.local'));
      state.gameOver = true;
      showGameOverOverlay(false);
      awardMatchEndPoints(false);
    }
  } else {
    if (state.rivalDeck.length > 0) {
      const drawnCard=state.rivalDeck.pop(); state.rivalHand.push(drawnCard);
      dispatchGameEvent({type:'card_drawn',controllerIsLocal:false,actorIsLocal:false,ownerIsLocal:false,card:drawnCard,zoneFrom:'library',zoneTo:'hand',cause:'draw_step'});
      logMsg(gameText('game.draw.rival'));
    } else {
      logMsg(gameText('game.deckout.rival'));
      state.gameOver = true;
      showGameOverOverlay(true);
      awardMatchEndPoints(true);
    }
  }
}

async function executeCleanupStep() {
  const isLocal = state.activePlayer === 'local';

  // 23.16.2: los permisos de Cast-from-Exile tienen duración de reglas y expiran en
  // Cleanup, antes de pasar el turno. `until_end_of_next_turn` sólo consume cierres del
  // controlador autorizado; `while_exiled` permanece hasta que la carta abandona Exilio.
  expireExilePlayPermissionsForCleanup(isLocal);
  
  // Limpiamos el daño residual
  state.localCombat.forEach(c => c.damageTaken = 0);
  state.rivalCombat.forEach(c => c.damageTaken = 0);

  // Trucos de combate "hasta el final del turno" (ej. Fuerza de Toro, A Cubierto) y Fog:
  // todo lo temporal expira acá, en Limpieza.
  state.localCombat.forEach(c => c.tempEffects = []);
  state.rivalCombat.forEach(c => c.tempEffects = []);
  state.combatDamagePrevented = false;

  // LAND 1: man-lands y Vehículos son mecánicas distintas. Las man-lands vuelven a Lands
  // conservando el mismo objeto; los Vehículos vuelven a Support.
  const revertTemporaryCreatures = (combatZone, supportZone, landsZone) => {
    for (let i = combatZone.length - 1; i >= 0; i--) {
      const item = combatZone[i];
      if (item.isAnimatedLand) {
        combatZone.splice(i, 1);
        const isLocalLand = landsZone === state.localLands;
        // Equip solo puede quedar unido a criatura; las Auras actuales también encantan criatura.
        // Al terminar la animación, el Equipo se desprende y esas Auras van al cementerio.
        detachEquipmentFrom(item, isLocalLand);
        sendAurasToGraveyard(item, isLocalLand);
        revertAnimatedLandState(item);
        landsZone.push(item);
        continue;
      }
      if (item.isVehicle) {
        const v = combatZone.splice(i, 1)[0];
        const isLocalVehicle = supportZone === state.localSupport;
        // Equipment/Auras actuales sólo pueden anexarse a criatura. Cuando el Vehículo deja
        // de ser criatura en Cleanup, esas anexiones pasan a ser ilegales (CR 704.5m/n).
        detachEquipmentFrom(v, isLocalVehicle);
        sendAurasToGraveyard(v, isLocalVehicle);
        v.isVehicle = false;
        delete v.card.power;
        delete v.card.toughness;
        v.wasLand = false;
        supportZone.push(v);
      }
    }
  };

  revertTemporaryCreatures(state.localCombat, state.localSupport, state.localLands);
  revertTemporaryCreatures(state.rivalCombat, state.rivalSupport, state.rivalLands);

  // 23.15.2: los cambios de control 'hasta el final del turno' terminan en Limpieza.
  expireTemporaryControlEffects();

  // Lógica de descarte habitual...
  if (isLocal) {
    const excess = state.localHand.length - 7;
    if (excess > 0) {
      state.isDiscarding = true;
      state.cardsToDiscard = excess;
      logMsg(gameText('game.handLimit.prompt', { count: excess }));
      render();
      return;
    }
  } else {
    const rivalExcess = state.rivalHand.length - 7;
    for (let i = 0; i < rivalExcess; i++) {
      const randomIndex = Math.floor(gameRandom('cleanup_random_discard') * state.rivalHand.length);
      const discarded = state.rivalHand.splice(randomIndex,1)[0];
      const plan=cleanupDiscardDestination(discarded,false);
      plan.destination.push(discarded);
      dispatchGameEvent({type:'card_discarded',controllerIsLocal:false,actorIsLocal:false,ownerIsLocal:plan.ownerIsLocal,card:discarded,zoneFrom:'hand',zoneTo:plan.zoneTo,cause:'cleanup_discard'});
      if(plan.zoneTo==='exile') dispatchGameEvent({type:'card_exiled',controllerIsLocal:false,actorIsLocal:false,ownerIsLocal:plan.ownerIsLocal,card:discarded,zoneFrom:'hand',zoneTo:'exile',cause:'cleanup_discard'});
      logMsg(gameText('game.handLimit.botDiscard', { card: discarded.name }));
    }
  }

  // Avanzamos turno automáticamente si no requiere descarte interactivo
  // BUGFIX: faltaba este await — advanceStep() es async, y sin esperarlo acá, quien llamó
  // a ESTA función (el advanceStep() de más arriba, que ya te está esperando a VOS con su
  // propio await) daba por completada la transición de turno cuando en realidad la
  // continuación recursiva (pasar de limpieza al enderezar del turno siguiente) todavía
  // podía seguir en curso en el fondo. Mismo patrón de bug que ya se arregló para
  // resolveCombatDamage().
  await advanceStep();
}

export async function handleDiscardClick(index) {
  const discardedCard=state.localHand.splice(index,1)[0];
  const plan=cleanupDiscardDestination(discardedCard,true);
  plan.destination.push(discardedCard);
  dispatchGameEvent({type:'card_discarded',controllerIsLocal:true,actorIsLocal:true,ownerIsLocal:plan.ownerIsLocal,card:discardedCard,zoneFrom:'hand',zoneTo:plan.zoneTo,cause:'cleanup_discard'});
  if(plan.zoneTo==='exile') dispatchGameEvent({type:'card_exiled',controllerIsLocal:true,actorIsLocal:true,ownerIsLocal:plan.ownerIsLocal,card:discardedCard,zoneFrom:'hand',zoneTo:'exile',cause:'cleanup_discard'});
  state.cardsToDiscard--;
  
  logMsg(gameText('game.handLimit.selfDiscard', { card: discardedCard.name }));

  if (state.cardsToDiscard <= 0) {
    state.isDiscarding = false;
    // BUGFIX: faltaba este await — mismo patrón que executeCleanupStep/resolveCombatDamage.
    // Sin él, el render() de acá abajo podía correr con la transición de turno todavía a
    // medio resolver en el fondo.
    await advanceStep();
  }
  
  render();
}

export function attemptPassTurn() {
  passPriority('local');
}

export function passTurnToRival() {
  passPriority('local');
}

// NOTA: código muerto por ahora — se importa y reexporta desde main.js, pero no hay ningún
// llamador activo en el resto del proyecto (probablemente un remanente de una etapa
// anterior del desarrollo). Se corrige igual, por consistencia con los otros 2 arreglos de
// este mismo lote y por si algo lo termina usando más adelante.
export async function startLocalTurn() {
  state.activePlayer = 'local';
  state.phase = 'untap';
  await advanceStep();
}

function getPhaseName(phaseKey) {
  const MAP = {
    untap: 'phase.log.untap', upkeep: 'phase.log.upkeep', draw: 'phase.log.draw', main1: 'phase.log.main1',
    combat_begin: 'phase.log.combat_begin', combat_attackers: 'phase.log.combat_attackers',
    combat_blockers: 'phase.log.combat_blockers', combat_damage: 'phase.log.combat_damage',
    combat_end: 'phase.log.combat_end', main2: 'phase.log.main2', end_step: 'phase.log.end_step', cleanup: 'phase.log.cleanup'
  };
  return MAP[phaseKey] ? gameText(MAP[phaseKey]) : phaseKey;
}
