// js/priorityUX.js
// ENTREGA 23.9 — reglas PURAS del HUD de turno/prioridad y del reloj multiplayer.
// No importa main/ui/turnManager para evitar otro ciclo de módulos. Todos los módulos
// pueden consultar estas reglas sobre un objeto state sin efectos secundarios.

export const PRIORITY_CLOCK_DURATION_MS = 15000;

export const PRIORITY_ACTIVITY_LABELS = Object.freeze({
  ready: ['Sincronizando el inicio…', 'está sincronizando el inicio…'],
  resolving: ['Resolviendo la pila…', 'está resolviendo la pila…'],
  discarding: ['Descartá las cartas requeridas.', 'está descartando cartas…'],
  paying_mana: ['Terminá de pagar el coste.', 'está pagando un coste…'],
  choosing_target: ['Elegí el objetivo.', 'está eligiendo un objetivo…'],
  choosing_ability: ['Elegí qué habilidad activar.', 'está eligiendo una habilidad…'],
  choosing_sacrifice: ['Elegí qué permanente sacrificar.', 'está eligiendo un sacrificio…'],
  choosing_attackers: ['Declarás atacantes antes de pasar prioridad.', 'está declarando atacantes…'],
  choosing_blockers: ['Declarás bloqueadores antes de pasar prioridad.', 'está declarando bloqueadores…'],
  assigning_damage: ['Terminá de asignar el daño.', 'está asignando daño…'],
  remote_decision: ['Completá la decisión pendiente.', 'está tomando una decisión…'],
  choosing_cards: ['Terminá la selección de cartas.', 'está seleccionando cartas…'],
  choosing_mode: ['Elegí una opción para continuar.', 'está eligiendo una opción…'],
  resolution_choice: ['Terminá la elección de resolución.', 'está resolviendo una elección…']
});

export function getPhaseUxLabel(phase) {
  const labels = {
    untap: 'ENDEREZAR', upkeep: 'MANTENIMIENTO', draw: 'ROBO', main1: 'MAIN 1',
    combat_begin: 'INICIO DE COMBATE', combat_attackers: 'ATACANTES',
    combat_blockers: 'BLOQUEADORES', combat_damage: 'DAÑO', combat_end: 'FIN DE COMBATE',
    main2: 'MAIN 2', end_step: 'PASO FINAL', cleanup: 'LIMPIEZA'
  };
  return labels[phase] || String(phase || '').toUpperCase();
}

function hasAnyResolutionChoice(state) {
  return !!(
    state.pendingFightChoice || state.pendingXChoice || state.pendingLoyaltyTargetChoice ||
    state.pendingMultiTargetChoice || state.pendingScrySurveilChoice || state.pendingProliferateChoice ||
    state.pendingHandFilterChoice || state.pendingDiscardChoice || state.pendingSacrificeEffectChoice ||
    state.pendingGraveyardChoice || state.pendingResolvedEffectTargetChoice || state.pendingEscapeExileChoice ||
    state.pendingRampChoice || state.pendingKickerChoice || state.pendingHybridLifePayment ||
    (state.resolvingSacrificeEffects || 0) > 0 || (state.resolvingCardFilterEffects || 0) > 0 ||
    (state.resolvingDiscardEffects || 0) > 0 || (state.resolvingGraveyardChoices || 0) > 0 ||
    (state.resolvingResolvedEffectTargetChoices || 0) > 0
  );
}

// Devuelve un código PÚBLICO, sin revelar mano/target/identidad de cartas privadas.
// Sólo describe qué clase de interacción está frenando el paso de prioridad.
export function deriveLocalPriorityActivity(state) {
  if (!state || state.gameOver) return null;
  if (state.multiplayerWaitingForReady) return 'ready';
  if ((state.consecutivePasses || 0) >= 2) return 'resolving';
  if (state.isDiscarding) return 'discarding';
  if (state.damageModalOpen) return 'assigning_damage';
  if (state.awaitingRivalDecision || state.respondingToDecision || state.pendingDecision || state.decisionResponse) return 'remote_decision';
  if (state.pendingTargetCard || state.pendingTargetSource) return 'choosing_target';
  if (state.pendingActivatedAbilityChoice) return 'choosing_ability';
  if (state.pendingSacrificeChoice || state.pendingSacrificeEffectChoice) return 'choosing_sacrifice';
  if (state.pendingModeChoice) return 'choosing_mode';
  if (state.pendingSpellIndex != null || state.pendingAbilitySource != null || state.pendingCrew || state.pendingWardChoice || state.pendingCounterUnlessPay || state.pendingCompositeCostPayment) return 'paying_mana';
  if (hasAnyResolutionChoice(state)) return 'choosing_cards';

  // Declaraciones obligatorias de combate NO son una ventana en la que un timeout pueda
  // simplemente llamar passPriority(). El reloj se pausa hasta que se declare explícitamente.
  if (state.phase === 'combat_attackers' && state.priorityPlayer === state.activePlayer) {
    const declared = state.activePlayer === 'local'
      ? (state.localAttackersDeclaredThisTurn || 0)
      : (state.rivalAttackersDeclaredThisTurn || 0);
    if (declared <= 0) return 'choosing_attackers';
  }
  if (state.phase === 'combat_blockers' && state.priorityPlayer !== state.activePlayer && (state.consecutivePasses || 0) === 1) {
    return 'choosing_blockers';
  }
  return null;
}

export function getEffectivePriorityActivity(state) {
  if (!state) return null;
  if (state.priorityPlayer === 'local') return deriveLocalPriorityActivity(state);
  return state.priorityActivity || null;
}

export function canPriorityClockRun(state) {
  if (!state?.currentMatch || state.gameOver || state.multiplayerWaitingForReady) return false;
  if (!['local', 'rival'].includes(state.priorityPlayer)) return false;
  if ((state.consecutivePasses || 0) >= 2) return false;
  return !getEffectivePriorityActivity(state);
}

export function getPriorityUxCopy(state, localName, rivalName, stackTopName = '') {
  const phase = getPhaseUxLabel(state?.phase);
  const isMyTurn = state?.activePlayer === 'local';
  const isMyPriority = state?.priorityPlayer === 'local';
  const activity = getEffectivePriorityActivity(state);
  const activityLabels = activity ? PRIORITY_ACTIVITY_LABELS[activity] : null;
  const safeLocal = localName || 'Vos';
  const safeRival = rivalName || 'tu rival';
  const turnText = isMyTurn ? `TU TURNO · ${phase}` : `TURNO DE ${safeRival.toUpperCase()} · ${phase}`;
  let priorityText = isMyPriority ? '⚡ PRIORIDAD: VOS' : `⏳ PRIORIDAD: ${safeRival.toUpperCase()}`;
  let contextText;

  if ((state?.consecutivePasses || 0) >= 2) {
    priorityText = '⚙️ RESOLVIENDO';
    contextText = stackTopName ? `Resolviendo ${stackTopName}…` : 'Ambos pasaron. Avanzando…';
  } else if (activityLabels) {
    contextText = isMyPriority
      ? activityLabels[0]
      : `Esperando a ${safeRival}… ${activityLabels[1]}`;
  } else if (isMyPriority) {
    contextText = stackTopName
      ? `Podés responder a ${stackTopName} o pasar prioridad.`
      : 'Podés jugar una acción legal o pasar prioridad.';
  } else {
    contextText = stackTopName
      ? `Esperando a ${safeRival}… puede responder a ${stackTopName}.`
      : `Esperando a ${safeRival}…`;
  }

  return { turnText, priorityText, contextText, isMyTurn, isMyPriority, activity, localName: safeLocal, rivalName: safeRival };
}
