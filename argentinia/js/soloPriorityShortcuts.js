// Argentinia 23.22.0 — Prioridad Inteligente / Stage B
// Etapa B base + adaptadores opt-in C para Torneo/Smart/Stops. PvP inalterado.
// No selecciona objetivos, no activa habilidades, no declara combate ni altera reglas.
import { SMART_PRIORITY_MODES, createPriorityTicketGate,
  evaluatePriorityIntent, assessPriorityWindow, createPriorityWindowKey } from './priorityIntelligence.js';

const B_SOLO_FLAGS = Object.freeze({
  automatedPassing: true, keyboardShortcuts: true, phaseStops: true,
  multiplayerAutomation: false
});
export const SOLO_PRIORITY_B_MODES = Object.freeze({
  MANUAL: 'manual',
  UNTIL_RESPONSE: SMART_PRIORITY_MODES.UNTIL_RESPONSE,
  THROUGH_TURN: SMART_PRIORITY_MODES.THROUGH_TURN,
  FULL_CONTROL: SMART_PRIORITY_MODES.FULL_CONTROL,
  SMART: SMART_PRIORITY_MODES.IF_NO_LEGAL_ACTION
});
const AUTOMATIC = new Set([SOLO_PRIORITY_B_MODES.UNTIL_RESPONSE, SOLO_PRIORITY_B_MODES.THROUGH_TURN, SOLO_PRIORITY_B_MODES.SMART]);

/** Controller born per browser session; every timeout is invalidated by its generation.
 * Injected clock/getters make regressions headless and deterministic.
 */
export function createSoloPriorityController({
  getState, getStack, getActivity = () => null, canPass = () => false,
  passOnce, isVisible = () => true, onChange = () => {},
  schedule = (callback, ms) => setTimeout(callback, ms),
  cancel = id => clearTimeout(id), delayMs = 125,
  stageCEnabled = false, allowTournament = false, getStops = () => [],
  getLegalActions = () => 'unknown',
  canSkipEmptyAttack = () => false, skipEmptyAttack = () => {},
  keepModeBetweenTurns = false
} = {}) {
  if ([getState,getStack,canPass,passOnce,isVisible,onChange,schedule,cancel,getStops,getLegalActions,canSkipEmptyAttack,skipEmptyAttack].some(f => typeof f !== 'function'))
    throw new TypeError('Stage B requiere adaptadores completos');
  const gate = createPriorityTicketGate();
  let mode = SOLO_PRIORITY_B_MODES.MANUAL;
  let turn = null;
  let generation = 0;
  let pendingId = null;
  let pendingWindowKey = null;
  let executing = false;
  let stoppedReason = null;
  let lastAutomaticWindow = null;

  function eligible(s) {
    return !!s && !s.currentMatch && (allowTournament || !s.currentTournamentMatch) && !s.gameOver &&
      !s.terminalProcessedLocally && !s.abandonedBy && !s.soloRuntimeSuspended &&
      !s.soloLifecycleReloading && isVisible() &&
      Number.isSafeInteger(s.turnCount) && s.turnCount > 0;
  }
  function snapshot() {
    const s = getState();
    const stack = getStack();
    const depth = Array.isArray(stack) ? stack.length : NaN;
    const top = depth > 0 ? stack[depth - 1] : null;
    // No inventar identidad cuando un item en pila no tiene ID.
    return {s, options:{ stackDepth: depth,
      stackTopId: top?.id || null, activity:getActivity(s),
      runtimeVisible:isVisible(), inFlight: executing }};
  }
  function clearScheduled() {
    if (pendingId !== null) { cancel(pendingId); pendingId = null; }
    pendingWindowKey = null;
  }
  function publish() { onChange({mode, turn, stoppedReason, available:eligible(getState())}); }
  function stop(reason = 'cancelled') {
    generation++;
    clearScheduled();
    gate.reset();
    lastAutomaticWindow = null;
    mode = SOLO_PRIORITY_B_MODES.MANUAL;
    turn = null;
    stoppedReason = reason;
    publish();
  }
  function setMode(next) {
    if (!Object.values(SOLO_PRIORITY_B_MODES).includes(next)) return false;
    if (next === SOLO_PRIORITY_B_MODES.MANUAL) { stop('manual'); return true; }
    const s = getState();
    if (!eligible(s) || (next === SOLO_PRIORITY_B_MODES.SMART && !stageCEnabled)) return false;
    // Control completo puede retener la respuesta a tus propios spells.
    generation++;
    clearScheduled();
    gate.reset();
    lastAutomaticWindow = null;
    mode = next;
    // Smart stays armed across turns; the other shortcuts remain turn-scoped.
    turn = keepModeBetweenTurns || next === SOLO_PRIORITY_B_MODES.SMART ? null : s.turnCount;
    stoppedReason = null;
    publish();
    onRender();
    return true;
  }
  function onRender() {
    const {s,options} = snapshot();
    if (!eligible(s)) {
      // Una ventana modal momentánea no borra la preferencia de atajo. Se revoca
      // el pase pendiente; al volver el tablero, se evalúa una ventana NUEVA.
      if (keepModeBetweenTurns && s && !s.currentMatch && (allowTournament || !s.currentTournamentMatch) &&
          !s.gameOver && !s.soloRuntimeSuspended && !s.soloLifecycleReloading &&
          !isVisible()) {
        generation++;clearScheduled();gate.reset();publish();return;
      }
      if (mode !== SOLO_PRIORITY_B_MODES.MANUAL || pendingId !== null) stop('out_of_solo');
      else publish();
      return;
    }
    if (turn !== null && s.turnCount !== turn) {
      stop('turn_changed');
      return;
    }
    // Soft pass: si aparece CUALQUIER objeto en la pila, retenemos la respuesta.
    // Es conservador también ante habilidades propias: no perdemos combos de stack.
    if (mode === SOLO_PRIORITY_B_MODES.UNTIL_RESPONSE && options.stackDepth > 0) {
      stop('stack_response');
      return;
    }
    // HF2 P0: al cambiar de ventana/turno mientras un timeout estaba pendiente,
    // cancelarlo YA y reevaluar; el timer anterior no llamaba onRender() al abortar
    // y dejaba al modo activo visualmente pero sin siguientes pases.
    const liveWindowKey=createPriorityWindowKey(s,options);
    if (pendingId !== null && pendingWindowKey !== liveWindowKey) {
      generation++;clearScheduled();gate.reset();
    }
    publish();
    if (!AUTOMATIC.has(mode) || pendingId !== null || executing) return;
    const stopPhases = stageCEnabled ? getStops() : [];
    // La parada explícita tiene prioridad incluso antes de declarar atacantes,
    // cuando assessPriorityWindow rechaza correctamente el pase automático.
    if (stopPhases.includes(s.phase) && s.priorityPlayer === 'local' &&
        options.stackDepth === 0) { stop('phase_stop');return; }
    // La declaración de ataque no es passPriority(): el botón canónico está habilitado,
    // pero `canPass` debe prohibir pasar prioridad ANTES de declarar. La comprobación
    // de ataque vacío debe ir antes del guard de pases normales.
    // Declarar CERO atacantes es una ACCIÓN OBLIGATORIA, no un pase de prioridad.
    // El motor Stage A la bloquea deliberadamente. Sólo el modo voluntario y con
    // prueba canónica de que NO existe atacante legal ejecuta el mismo botón de UI.
    // No evitamos el comienzo/fin de combate: triggers y ventanas siguen intactos.
    if (stageCEnabled && s.phase === 'combat_attackers' && s.activePlayer === 'local' &&
        s.priorityPlayer === 'local' && options.stackDepth === 0 &&
        !stopPhases.includes(s.phase) && canSkipEmptyAttack(s) &&
        AUTOMATIC.has(mode)) {
      const key = createPriorityWindowKey(s, options);
      if (!key || key === lastAutomaticWindow) return;
      const scheduledGeneration = generation;
      pendingWindowKey=key;
      pendingId = schedule(async () => {
        pendingId = null;pendingWindowKey=null;
        const current = snapshot();
        if (scheduledGeneration !== generation || executing ||
            !eligible(current.s) ||
            stopPhases.some(phase => phase === current.s?.phase) ||
            !canSkipEmptyAttack(current.s) ||
            createPriorityWindowKey(current.s,current.options) !== key) return;
        executing = true;
        lastAutomaticWindow = key;
        try { await skipEmptyAttack(); }
        catch(error) { stop('attack_skip_failed'); console.warn('[Prioridad Stage C] No se pudo declarar ataque vacío:',error); }
        finally { executing=false; if (scheduledGeneration === generation) onRender(); }
      }, delayMs);
      return;
    }
    if (!canPass()) return;
    // Reaching an explicit stop returns to manual control. Nothing is chosen on behalf
    // of the human. Stops are local to the browser and override through-turn.
    if (stopPhases.includes(s.phase) &&
        assessPriorityWindow(s, options).safeToEvaluate) { stop('phase_stop');return; }
    const legalActions = stageCEnabled && mode === SOLO_PRIORITY_B_MODES.SMART
      ? getLegalActions(s, options) : 'unknown';
    const intent = evaluatePriorityIntent(s, {
      ...options, mode, featureFlags:B_SOLO_FLAGS, originalTurnCount:turn ?? s.turnCount,
      opposingActionOnStack:options.stackDepth > 0,
      legalActions, stopPhases
    });
    if (intent.action !== 'propose_single_pass') return;
    const ticket = gate.acquire(s, options);
    if (!ticket) return;
    const scheduledGeneration = generation;
    pendingWindowKey=createPriorityWindowKey(s,options);
    pendingId = schedule(async () => {
      pendingId = null;pendingWindowKey=null;
      if (scheduledGeneration !== generation || !AUTOMATIC.has(mode) || executing) {
        gate.finish(ticket); return;
      }
      const fresh = snapshot();
      const freshStops = stageCEnabled ? getStops() : [];
      const freshLegalActions = stageCEnabled && mode === SOLO_PRIORITY_B_MODES.SMART
        ? getLegalActions(fresh.s, fresh.options) : 'unknown';
      const evaluation = evaluatePriorityIntent(fresh.s, {
        ...fresh.options, mode, featureFlags:B_SOLO_FLAGS, originalTurnCount:turn ?? fresh.s?.turnCount,
        opposingActionOnStack:fresh.options.stackDepth > 0,
        legalActions:freshLegalActions, stopPhases:freshStops
      });
      if (!eligible(fresh.s) || !canPass() || evaluation.action !== 'propose_single_pass' ||
          !gate.isCurrent(ticket, fresh.s, fresh.options)) {
        gate.finish(ticket);
        if (mode === SOLO_PRIORITY_B_MODES.UNTIL_RESPONSE && fresh.options.stackDepth > 0) stop('stack_response');
        else if (freshStops.includes(fresh.s?.phase) && assessPriorityWindow(fresh.s, fresh.options).safeToEvaluate) stop('phase_stop');
        return;
      }
      executing = true;
      try {
        // La única mutación permitida es pasar UNA prioridad mediante el motor canónico.
        await passOnce();
        gate.finish(ticket, {committedPass:true});
      } catch (error) {
        gate.finish(ticket);
        stop('pass_failed');
        // Nunca disparar unhandled rejection desde una tarea de UI.
        console.warn('[Prioridad Stage B] Pase abortado:', error);
      } finally {
        executing = false;
        if (scheduledGeneration === generation) onRender();
      }
    }, delayMs);
  }
  return Object.freeze({
    get mode() { return mode; },
    get stoppedReason() { return stoppedReason; },
    get activeTurn() { return turn; },
    setMode, cancel:stop, onRender, reset:() => stop('session_reset'),
    canUse:() => eligible(getState()),
    onStopsChanged() { if (!stageCEnabled) return; generation++;clearScheduled();gate.reset();onRender(); },
    // La detección Smart requiere adaptadores Stage C explícitos; B sigue OFF.
    flags:B_SOLO_FLAGS
  });
}
