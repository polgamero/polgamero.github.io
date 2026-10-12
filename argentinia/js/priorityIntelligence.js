// ARGENTINIA 23.22.0 — PRIORIDAD INTELIGENTE / STAGE A (2026-10-10)
// Núcleo PURO, fail-closed y NO conectado a passPriority(), timers ni Firestore.
// Ningún pase automático ni input nuevo se habilita en Stage A.
// Futuras etapas deben invocar el motor canónico y volver a validar la ventana al ejecutar.

export const SMART_PRIORITY_FLAGS = Object.freeze({
  automatedPassing: false,
  keyboardShortcuts: false,
  phaseStops: false,
  multiplayerAutomation: false
});

export const SMART_PRIORITY_MODES = Object.freeze({
  SINGLE: 'single',
  UNTIL_RESPONSE: 'until_response',
  THROUGH_TURN: 'through_turn',
  FULL_CONTROL: 'full_control',
  IF_NO_LEGAL_ACTION: 'if_no_legal_action'
});

export const SMART_PRIORITY_PHASES = Object.freeze([
  'untap', 'upkeep', 'draw', 'main1', 'combat_begin', 'combat_attackers',
  'combat_blockers', 'combat_damage', 'combat_end', 'main2', 'end_step', 'cleanup'
]);
const phaseSet = new Set(SMART_PRIORITY_PHASES);
const NO_PRIORITY_PHASES = new Set(['untap', 'cleanup']);
const mandatoryActivities = new Set([
  'choosing_attackers', 'choosing_blockers', 'discarding', 'assigning_damage',
  'choosing_target', 'choosing_ability', 'choosing_sacrifice', 'choosing_cards',
  'choosing_mode', 'resolution_choice', 'remote_decision', 'paying_mana',
  'ready', 'resolving'
]);

// Campos transitorios confirmados en main.js, priorityUX.js y turnManager.js HF8.
// Son conservadores: una decisión o una transacción incierta bloquea la automatización.
const NONBLOCKING_PENDING_METADATA = new Set([
  'pendingKicked', 'pendingXValue', 'pendingAlternativeCostChosen',
  'pendingCastFrom', 'pendingSpellCostsIrreversible'
]);
const BLOCKING_FIELDS = Object.freeze([
  'isDiscarding', 'damageModalOpen', 'pendingLegendChoice', 'pendingTriggerOrderChoice',
  'sbaKernelRunning', 'pendingFightChoice', 'pendingXChoice', 'pendingLoyaltyTargetChoice',
  'pendingMultiTargetChoice', 'pendingScrySurveilChoice', 'pendingProliferateChoice',
  'pendingHandFilterChoice', 'pendingDiscardChoice', 'pendingSacrificeChoice',
  'pendingSacrificeEffectChoice', 'pendingGraveyardChoice', 'pendingResolvedEffectTargetChoice',
  'pendingEscapeExileChoice', 'pendingRampChoice', 'pendingLandSearchChoice',
  'pendingLibraryChoice', 'pendingKickerChoice', 'pendingKickerResolutionContinuation',
  'pendingHybridLifePayment', 'pendingPrivateZoneChoice', 'pendingAlternativeCostChoice',
  'pendingActivatedAbilityChoice', 'pendingTargetCard', 'pendingTargetSource',
  'pendingAbilitySource', 'pendingCrew', 'pendingWardChoice', 'pendingCounterUnlessPay',
  'pendingCompositeCostPayment', 'pendingModeChoice', 'pendingCastTransaction',
  'pendingSuspendTransaction', 'pendingSuspendCastChoice', 'pendingSpellIndex',
  'pendingUntapLandChoice', 'pendingDecision', 'decisionResponse',
  'respondingToDecision', 'awaitingRivalDecision', 'pendingStackObjectChoice',
  'pendingCreatureTypeChoice', 'pendingCopyRetargetChoice',
  'resolvingSacrificeEffects', 'resolvingCardFilterEffects', 'resolvingDiscardEffects',
  'resolvingGraveyardChoices', 'resolvingResolvedEffectTargetChoices'
]);

// main.js keeps the Ward queue as [] between transactions. A collection existing
// in the state is not a pending choice. Only this canonical queue has that contract;
// unfamiliar pending fields still fail closed, including unfamiliar empty arrays.
function hasPendingValue(s, name) {
  const value = s[name];
  if (name === 'pendingWardQueue' && Array.isArray(value)) return value.length > 0;
  return !!value;
}

function blockingDecisionField(s) {
  return BLOCKING_FIELDS.find(name => hasPendingValue(s, name)) ||
    Object.keys(s).find(name => /^pending[A-Z]/.test(name) &&
      !NONBLOCKING_PENDING_METADATA.has(name) && hasPendingValue(s, name)) || null;
}

// No entregar a telemetría ni a matchSync los parámetros que identifican cartas privadas.
// windowKey es SOLO LOCAL, opaco, y nunca se serializa a estado de juego.
export function createPriorityWindowKey(s, { stackDepth, stackTopId = null, localEpoch = 0, networkRevision = 0 } = {}) {
  if (!s || typeof s !== 'object' || !Number.isSafeInteger(stackDepth) || stackDepth < 0) return null;
  const values = [
    Number(s.turnCount), s.phase, s.activePlayer, s.priorityPlayer,
    Number(s.consecutivePasses), Number(s.priorityClockSerial), Number(s.triggerStackSerial),
    stackDepth, stackDepth ? String(stackTopId ?? '') : '',
    s.currentMatch ? String(s.currentMatch.matchId || '') : 'solo',
    s.currentMatch ? String(s.currentMatch.myRole || '') : '',
    Number(localEpoch), s.currentMatch ? networkRevision : 0
  ];
  if (!Number.isSafeInteger(values[0]) || values[0] < 1 || !Number.isSafeInteger(values[5]) ||
      values[5] < 0 || !Number.isSafeInteger(values[6]) || values[6] < 0 ||
      !Number.isSafeInteger(values[11]) || values[11] < 0 ||
      !Number.isSafeInteger(values[12]) || values[12] < 0) return null;
  return JSON.stringify(values);
}

/**
 * Diagnóstico sin mutaciones. Las garantías son LOCALES: no son autorizaciones servidor.
 * stackDepth y stackTopId deben provenir de spellStack real, NO del conteo de cartas en mano.
 * Si no se pueden aportar esos datos se rechaza automatización (fail closed).
 */
export function assessPriorityWindow(s, {
  stackDepth, stackTopId = null, activity = null, interactionBlocked = false,
  runtimeVisible = true, inFlight = false, localEpoch = 0, networkRevision = 0, multiplayerReady
} = {}) {
  let reason = 'ok';
  if (!s || typeof s !== 'object') reason = 'invalid_state';
  else if (s.gameOver || s.terminalProcessedLocally || s.abandonedBy) reason = 'terminal';
  else if (s.soloRuntimeSuspended || s.soloLifecycleReloading || runtimeVisible !== true) reason = 'runtime_suspended';
  else if (s.currentMatch && (!s.currentMatch.matchId || !['host', 'guest'].includes(s.currentMatch.myRole))) reason = 'match_identity_unverified';
  else if (s.currentMatch && (s.multiplayerSessionSuperseded || s.multiplayerSyncBlocked || s.multiplayerWaitingForReady || interactionBlocked)) reason = 'multiplayer_blocked';
  else if (s.currentMatch && (s.matchSyncBusy || s.multiplayerResolutionMarker || s.stackResolutionAuthority)) reason = 'multiplayer_in_flight';
  else if (s.currentMatch && multiplayerReady === false) reason = 'multiplayer_unconfirmed';
  else if (inFlight) reason = 'transition_in_flight';
  else if (!phaseSet.has(s.phase)) reason = 'unknown_phase';
  else if (NO_PRIORITY_PHASES.has(s.phase)) reason = 'no_priority_in_phase';
  else if (!['local', 'rival'].includes(s.activePlayer) || !['local', 'rival'].includes(s.priorityPlayer)) reason = 'unknown_player';
  else if (s.priorityPlayer !== 'local') reason = 'not_local_priority';
  else if (![0, 1].includes(s.consecutivePasses)) reason = 'passes_unstable';
  else if (!Number.isSafeInteger(stackDepth) || stackDepth < 0 || (stackDepth > 0 && !stackTopId)) reason = 'stack_unverified';
  else if (s.autoZeroBlockersQueued) reason = 'blockers_fast_window';
  else if (blockingDecisionField(s)) reason = 'decision_or_transaction';
  else if (mandatoryActivities.has(activity) || (activity !== null && activity !== undefined)) reason = 'activity_pending';
  else if (s.phase === 'combat_attackers' && s.activePlayer === 'local' &&
      !(Number(s.localAttackersDeclaredThisTurn) > 0)) reason = 'attack_declaration';
  else if (s.phase === 'combat_blockers' && s.activePlayer === 'rival' &&
      !s.localBlockersDeclaredThisCombat) reason = 'block_declaration';
  else if (!createPriorityWindowKey(s, {stackDepth, stackTopId, localEpoch, networkRevision})) reason = 'invalid_window_identity';
  // No recomendar nunca un pase sólo por no tener maná o no tener cartas en mano.
  return Object.freeze({ safeToEvaluate: reason === 'ok', reason, phase: s?.phase || null,
    blockingField: reason === 'decision_or_transaction' ? blockingDecisionField(s) : null });
}

/**
 * Política en modo simulación. No emite efectos, eventos, acciones ni writes.
 * legalActions: 'none' (prueba exhaustiva futura), 'available' o 'unknown'.
 * No infiere legalidad de los recursos. Stops no crean prioridad en pasos sin prioridad.
 */
export function evaluatePriorityIntent(s, {
  mode = SMART_PRIORITY_MODES.SINGLE,
  featureFlags = SMART_PRIORITY_FLAGS, legalActions = 'unknown',
  stopPhases = [], opposingActionOnStack = false,
  originalTurnCount = s?.turnCount, ...windowOptions
} = {}) {
  if (!featureFlags?.automatedPassing) return Object.freeze({ action: 'hold', reason: 'feature_disabled' });
  const window = assessPriorityWindow(s, windowOptions);
  if (!window.safeToEvaluate) return Object.freeze({ action: 'hold', reason: window.reason });
  if (s.currentMatch && !featureFlags.multiplayerAutomation) return Object.freeze({ action: 'hold', reason: 'multiplayer_disabled' });
  if (!Array.isArray(stopPhases) || stopPhases.includes(s.phase)) return Object.freeze({ action: 'hold', reason: 'phase_stop' });
  if (!Number.isSafeInteger(originalTurnCount) || originalTurnCount !== s.turnCount) return Object.freeze({ action: 'hold', reason: 'turn_changed' });
  if (mode === SMART_PRIORITY_MODES.FULL_CONTROL || mode === SMART_PRIORITY_MODES.SINGLE) return Object.freeze({ action: 'hold', reason: 'manual_mode' });
  if (mode === SMART_PRIORITY_MODES.UNTIL_RESPONSE && opposingActionOnStack) return Object.freeze({ action: 'hold', reason: 'response_required' });
  if (mode === SMART_PRIORITY_MODES.IF_NO_LEGAL_ACTION && legalActions !== 'none') return Object.freeze({ action: 'hold', reason: 'legal_actions_not_proven_absent' });
  if (![SMART_PRIORITY_MODES.UNTIL_RESPONSE, SMART_PRIORITY_MODES.THROUGH_TURN, SMART_PRIORITY_MODES.IF_NO_LEGAL_ACTION].includes(mode)) {
    return Object.freeze({ action: 'hold', reason: 'unknown_mode' });
  }
  return Object.freeze({ action: 'propose_single_pass', reason: mode });
}

/**
 * Guard de tickets: serial monotónico y un único lease en vuelo. No ejecuta el ticket.
 * El invocador futuro debe revalidar estado/stack/sesión INMEDIATAMENTE antes de pasar.
 * reset() se invoca al cambiar sesión, abandonar, recuperar estado o reconectar.
 */
export function createPriorityTicketGate() {
  let epoch = 0;
  let inFlight = null;
  let committed = null;
  let serial = 0;
  return Object.freeze({
    get epoch() { return epoch; },
    get busy() { return inFlight !== null; },
    reset() { epoch++; inFlight = null; committed = null; },
    acquire(s, options = {}) {
      if (inFlight !== null) return null;
      const assessment = assessPriorityWindow(s, { ...options, localEpoch: epoch });
      if (!assessment.safeToEvaluate) return null;
      const key = createPriorityWindowKey(s, { ...options, localEpoch: epoch });
      if (!key || key === committed) return null;
      const ticket = Object.freeze({ serial: ++serial, epoch, key });
      inFlight = ticket;
      return ticket;
    },
    isCurrent(ticket, s, options = {}) {
      if (!ticket || inFlight !== ticket || ticket.epoch !== epoch) return false;
      const assessment = assessPriorityWindow(s, { ...options, localEpoch: epoch });
      return assessment.safeToEvaluate && ticket.key === createPriorityWindowKey(s, { ...options, localEpoch: epoch });
    },
    finish(ticket, { committedPass = false } = {}) {
      if (!ticket || ticket !== inFlight || ticket.epoch !== epoch) return false;
      if (committedPass) committed = ticket.key;
      inFlight = null;
      return true;
    }
  });
}
