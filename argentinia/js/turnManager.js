import { logMsg, els, showGameOverOverlay, render } from './ui.js';
import { state } from './main.js';
import { takeBotPriorityAction } from './bot.js';
import { spellStack, resolveTopStackItem } from './stackManager.js';
import { resolveCombatDamage } from './combatRules.js';
import { hasKeyword } from './keywords.js';

export function checkGameOver() {
  if (state.gameOver) return;
  if (state.localHP <= 0) {
    state.gameOver = true; logMsg("💀 Te quedaste sin HP. ¡Ganó el Tano!"); showGameOverOverlay(false);
  } else if (state.rivalHP <= 0) {
    state.gameOver = true; logMsg("🏆 ¡VICTORIA! Hiciste morder el polvo al Tano."); showGameOverOverlay(true);
  }
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

  logMsg(`📌 --- ${state.activePlayer === 'local' ? 'Tu' : 'Turno Tano'}: Paso de ${getPhaseName(state.phase)} ---`);

  // Lógica de fases automáticas
  if (state.phase === 'untap') {
    executeUntapStep();
    await advanceStep();
    return;
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

  if (state.phase === 'cleanup') {
    executeCleanupStep();
    return;
  }

  render();

  // Si le toca la prioridad al Tano, le notificamos a su IA
  if (state.priorityPlayer === 'rival') {
    setTimeout(takeBotPriorityAction, 600);
  }
}

export async function passPriority(player) {
  if (state.gameOver) return;

  // NUEVO: Bloqueo de seguridad si hay que descartar
  if (state.isDiscarding) {
    logMsg("⚠️ Tenés que descartar antes de poder pasar la prioridad.");
    return; 
  }
  
  if (state.priorityPlayer !== player) return;

  logMsg(`💬 ${player === 'local' ? 'Pasaste' : 'El Tano pasó'} prioridad.`);
  state.consecutivePasses++;

  // Si hay algo en la pila y ambos pasaron
  if (spellStack.length > 0) {
    if (state.consecutivePasses >= 2) {
      logMsg("⚡ Ambos pasaron prioridad. Resolviendo la cima de la pila...");
      state.consecutivePasses = 0;
      await resolveTopStackItem();
      render();
      if (state.priorityPlayer === 'rival') setTimeout(takeBotPriorityAction, 600);
      return;
    }
  } else {
    // Si la pila está vacía y ambos pasaron -> avanzamos de paso
    if (state.consecutivePasses >= 2) {
      await advanceStep();
      return;
    }
  }

  // Rotar prioridad al otro jugador
  state.priorityPlayer = state.priorityPlayer === 'local' ? 'rival' : 'local';
  render();

  if (state.priorityPlayer === 'rival') {
    setTimeout(takeBotPriorityAction, 600);
  }
}

function executeUntapStep() {
  const isLocal = state.activePlayer === 'local';
  if (isLocal) {
    state.localLandPlayedThisTurn = false;
    state.localLands.forEach(l => l.tapped = false);
    state.localCombat.forEach(c => { c.tapped = false; c.summoningSickness = false; c.isAttacking = false; c.blockingIndex = null; c.damageTaken = 0; });
    state.localSupport.forEach(s => s.tapped = false);
  } else {
    state.rivalLandPlayedThisTurn = false;
    state.rivalLands.forEach(l => l.tapped = false);
    state.rivalCombat.forEach(c => { c.tapped = false; c.summoningSickness = false; c.isAttacking = false; c.blockingIndex = null; c.damageTaken = 0; });
    state.rivalSupport.forEach(s => s.tapped = false);
  }
  logMsg(`🔄 Permanentes enderezados para ${isLocal ? 'El Gaucho' : 'El Tano'}.`);
}

function executeDrawStep() {
  const isLocal = state.activePlayer === 'local';
  if (isLocal && state.localDeck.length > 0) {
    state.localHand.push(state.localDeck.pop());
    logMsg(`🃏 Robaste una carta.`);
  } else if (!isLocal && state.rivalDeck.length > 0) {
    state.rivalHand.push(state.rivalDeck.pop());
    logMsg(`🃏 El Tano robó una carta.`);
  }
}

function executeCleanupStep() {
  const isLocal = state.activePlayer === 'local';
  
  // Limpiamos el daño residual
  state.localCombat.forEach(c => c.damageTaken = 0);
  state.rivalCombat.forEach(c => c.damageTaken = 0);

  // LÓGICA NUEVA: Devolver vehículos a la zona de soporte
  const revertVehicles = (combatZone, supportZone) => {
    for (let i = combatZone.length - 1; i >= 0; i--) {
      if (combatZone[i].isVehicle) {
        const v = combatZone.splice(i, 1)[0];
        v.isVehicle = false;
        // Le borramos las estadísticas de criatura
        delete v.card.power;
        delete v.card.toughness;
        supportZone.push(v);
      }
    }
  };

  revertVehicles(state.localCombat, state.localSupport);
  revertVehicles(state.rivalCombat, state.rivalSupport);

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
