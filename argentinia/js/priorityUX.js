import { gameText } from './gameTexts.js';
// js/priorityUX.js
// ENTREGA 23.9.1 — reglas PURAS del HUD compacto de turno/prioridad y del reloj multiplayer.
// No importa main/ui/turnManager para evitar otro ciclo de módulos. Todos los módulos
// pueden consultar estas reglas sobre un objeto state sin efectos secundarios.

export const PRIORITY_CLOCK_DURATION_MS = 15000;


export const PRIORITY_ACTIVITY_CHIPS = Object.freeze({
  ready: 'SINCRONIZANDO',
  resolving: 'RESOLVIENDO',
  discarding: 'DESCARTANDO',
  paying_mana: 'PAGANDO',
  choosing_target: 'OBJETIVO',
  choosing_ability: 'HABILIDAD',
  choosing_sacrifice: 'SACRIFICIO',
  choosing_attackers: 'ATACANTES',
  choosing_blockers: 'BLOQUEADORES',
  assigning_damage: 'ASIGNANDO DAÑO',
  remote_decision: 'DECISIÓN',
  choosing_cards: 'SELECCIÓN',
  choosing_mode: 'MODO',
  resolution_choice: 'ELECCIÓN'
});

// Los códigos de actividad siguen siendo contrato técnico. Sólo la copy que se deriva de ellos
// pasa por gameText(), para que un override jamás pueda alterar el estado de prioridad.
const PRIORITY_ACTIVITY_TEXT_KEYS = Object.freeze({
  ready: 'ready', resolving: 'resolving', discarding: 'discarding', paying_mana: 'paying_mana',
  choosing_target: 'choosing_target', choosing_ability: 'choosing_ability', choosing_sacrifice: 'choosing_sacrifice',
  choosing_attackers: 'choosing_attackers', choosing_blockers: 'choosing_blockers', assigning_damage: 'assigning_damage',
  remote_decision: 'remote_decision', choosing_cards: 'choosing_cards', choosing_mode: 'choosing_mode',
  resolution_choice: 'resolution_choice'
});

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

const PHASE_TEXT_KEYS = Object.freeze({
  untap: 'phase.hud.untap', upkeep: 'phase.hud.upkeep', draw: 'phase.hud.draw', main1: 'phase.hud.main1',
  combat_begin: 'phase.hud.combat_begin', combat_attackers: 'phase.hud.combat_attackers',
  combat_blockers: 'phase.hud.combat_blockers', combat_damage: 'phase.hud.combat_damage', combat_end: 'phase.hud.combat_end',
  main2: 'phase.hud.main2', end_step: 'phase.hud.end_step', cleanup: 'phase.hud.cleanup'
});

export function getPhaseUxLabel(phase) {
  const key = PHASE_TEXT_KEYS[phase];
  return key ? gameText(key) : String(phase || '').toUpperCase();
}

function hasAnyResolutionChoice(state) {
  return !!(
    state.pendingLegendChoice || state.pendingTriggerOrderChoice || state.pendingFightChoice || state.pendingXChoice || state.pendingLoyaltyTargetChoice ||
    state.pendingMultiTargetChoice || state.pendingScrySurveilChoice || state.pendingProliferateChoice ||
    state.pendingHandFilterChoice || state.pendingDiscardChoice || state.pendingSacrificeEffectChoice ||
    state.pendingGraveyardChoice || state.pendingResolvedEffectTargetChoice || state.pendingEscapeExileChoice ||
    state.pendingRampChoice || state.pendingLandSearchChoice || state.pendingLibraryChoice || state.pendingKickerChoice || state.pendingHybridLifePayment || state.pendingPrivateZoneChoice ||
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
  if (state.pendingTargetCard || state.pendingTargetSource || state.pendingCastTransaction?.stage === 'targets') return 'choosing_target';
  if (state.pendingActivatedAbilityChoice) return 'choosing_ability';
  if (state.pendingSacrificeChoice || state.pendingSacrificeEffectChoice) return 'choosing_sacrifice';
  if (state.pendingModeChoice || state.pendingAlternativeCostChoice) return 'choosing_mode';
  if (state.pendingSpellIndex != null || state.pendingCastTransaction?.stage === 'payment' || state.pendingAbilitySource != null || state.pendingCrew || state.pendingWardChoice || state.pendingCounterUnlessPay || state.pendingCompositeCostPayment) return 'paying_mana';
  if (hasAnyResolutionChoice(state)) return 'choosing_cards';

  // 23.13.36: declarar atacantes/bloqueadores sigue siendo una decisión obligatoria, pero
  // NO puede pausar indefinidamente una partida multiplayer. La actividad se mantiene para
  // UX/telemetría mientras la mecha corre; al vencer, turnManager confirma una declaración
  // vacía (0 atacantes / 0 bloqueadores) en vez de dejar el juego congelado.
  if (state.phase === 'combat_attackers' && state.priorityPlayer === state.activePlayer) {
    const declared = state.activePlayer === 'local'
      ? (state.localAttackersDeclaredThisTurn || 0)
      : (state.rivalAttackersDeclaredThisTurn || 0);
    if (declared <= 0) return 'choosing_attackers';
  }
  if (state.phase === 'combat_blockers' && state.priorityPlayer !== state.activePlayer && (state.consecutivePasses || 0) === 1) {
    const defenderDeclared = state.activePlayer === 'rival'
      ? !!state.localBlockersDeclaredThisCombat
      : !!state.rivalBlockersDeclaredThisCombat;
    if (!defenderDeclared) return 'choosing_blockers';
  }
  return null;
}

export function getEffectivePriorityActivity(state) {
  if (!state) return null;
  if (state.priorityPlayer === 'local') return deriveLocalPriorityActivity(state);
  return state.priorityActivity || null;
}

const PRIORITY_ACTIVITY_CLOCK_CONTINUES = new Set(['choosing_attackers', 'choosing_blockers']);

export function canPriorityClockRun(state) {
  if (!state?.currentMatch || state.gameOver || state.multiplayerWaitingForReady) return false;
  if (!['local', 'rival'].includes(state.priorityPlayer)) return false;
  if ((state.consecutivePasses || 0) >= 2) return false;
  const activity = getEffectivePriorityActivity(state);
  return !activity || PRIORITY_ACTIVITY_CLOCK_CONTINUES.has(activity);
}


export function getFrozenPriorityRemainingMs({ wasPaused = false, remainingMs, deadlineMs, nowMs = Date.now() } = {}) {
  const stored = Number(remainingMs);
  if (wasPaused && Number.isFinite(stored)) return Math.max(0, stored);
  const deadline = Number(deadlineMs);
  const now = Number(nowMs);
  if (Number.isFinite(deadline) && Number.isFinite(now)) return Math.max(0, deadline - now);
  return Math.max(0, Number.isFinite(stored) ? stored : 0);
}

export function getPriorityUxCopy(state, localName, rivalName, stackTopName = '') {
  const phase = getPhaseUxLabel(state?.phase);
  const isMyTurn = state?.activePlayer === 'local';
  const isMyPriority = state?.priorityPlayer === 'local';
  const activity = getEffectivePriorityActivity(state);
  const activityKey = activity ? PRIORITY_ACTIVITY_TEXT_KEYS[activity] : null;
  const activityLabels = activityKey ? [
    gameText(`priority.activity.${activityKey}.local`),
    gameText(`priority.activity.${activityKey}.rival`)
  ] : null;
  const safeLocal = localName || 'Vos';
  const safeRival = rivalName || 'tu rival';
  const resolving = (state?.consecutivePasses || 0) >= 2;

  // 23.9.1: la cabecera se divide en dueño del turno + badge de fase. Nunca vuelve a
  // concatenar un nombre largo con "MANTENIMIENTO" en una sola línea del sidebar.
  const turnOwnerText = isMyTurn ? gameText('priority.turn.yours') : gameText('priority.turn.rival', { rival: safeRival.toUpperCase() });
  const turnText = `${turnOwnerText} · ${phase}`; // compatibilidad con contratos/telemetría previos.

  let priorityText;
  let contextText;
  let stateChipText;
  let stateChipKind;

  if (resolving) {
    priorityText = gameText('priority.resolving');
    contextText = stackTopName ? gameText('priority.context.resolvingTop', { stackTop: stackTopName }) : gameText('priority.context.bothPassed');
    stateChipText = gameText('priority.state.resolving');
    stateChipKind = 'resolving';
  } else if (activityLabels) {
    const chip = activityKey ? gameText(`priority.activity.${activityKey}.chip`) : gameText('priority.state.action');
    priorityText = isMyPriority ? `⏸ ${chip}` : gameText('priority.waiting', { rival: safeRival.toUpperCase() });
    contextText = isMyPriority
      ? activityLabels[0]
      : `${safeRival} ${activityLabels[1]}`;
    stateChipText = chip;
    stateChipKind = 'activity';
  } else if (isMyPriority) {
    priorityText = gameText('priority.yours');
    contextText = stackTopName
      ? gameText('priority.context.respond', { stackTop: stackTopName })
      : gameText('priority.context.playOrPass');
    stateChipText = gameText('priority.state.yours');
    stateChipKind = 'my-priority';
  } else {
    priorityText = gameText('priority.waiting', { rival: safeRival.toUpperCase() });
    contextText = stackTopName
      ? gameText('priority.context.rivalCanRespond', { stackTop: stackTopName })
      : gameText('priority.context.waitingAction');
    stateChipText = gameText('priority.state.rival');
    stateChipKind = 'rival-priority';
  }

  return {
    turnText,
    turnOwnerText,
    phaseText: phase,
    priorityText,
    contextText,
    stateChipText,
    stateChipKind,
    isMyTurn,
    isMyPriority,
    activity,
    localName: safeLocal,
    rivalName: safeRival
  };
}
