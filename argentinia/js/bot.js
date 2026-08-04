import { hasKeyword, canBlock, predictDuel } from './keywords.js';
import {
  state,
  logMsg,
  render,
  parseManaCost,
  getLandColor,
  sleep,
  getEffectivePower,
  getEffectiveToughness,
  passPriority // Importado del nuevo turnManager / main
} from './main.js';

import { assignBotBlockers } from './combatRules.js';
import { addToStack, spellStack } from './stackManager.js';

export function canRivalAfford(card) {
  if (!card.manaCost) return true;
  const cost = parseManaCost(card.manaCost);
  
  const available = { W: 0, U: 0, B: 0, R: 0, G: 0, total: 0 };
  
  state.rivalLands.forEach(landItem => {
    if (!landItem.tapped) {
      const color = getLandColor(landItem.card);
      if (['W', 'U', 'B', 'R', 'G'].includes(color)) {
        available[color]++;
      }
      available.total++;
    }
  });

  if (available.W < cost.W) return false;
  if (available.U < cost.U) return false;
  if (available.B < cost.B) return false;
  if (available.R < cost.R) return false;
  if (available.G < cost.G) return false;

  const remainingForGeneric = available.total - (cost.W + cost.U + cost.B + cost.R + cost.G);
  if (remainingForGeneric < cost.generic) return false;

  return true;
}

export function tapRivalLandsFor(card) {
  if (!card.manaCost) return;
  const cost = parseManaCost(card.manaCost);
  
  ['W', 'U', 'B', 'R', 'G'].forEach(color => {
    let needed = cost[color];
    for (let i = 0; i < state.rivalLands.length && needed > 0; i++) {
      const land = state.rivalLands[i];
      if (!land.tapped && getLandColor(land.card) === color) {
        land.tapped = true;
        needed--;
      }
    }
  });

  let genericNeeded = cost.generic;
  for (let i = 0; i < state.rivalLands.length && genericNeeded > 0; i++) {
    const land = state.rivalLands[i];
    if (!land.tapped) {
      land.tapped = true;
      genericNeeded--;
    }
  }
}

function isCounterSpell(card) {
  return card.effect && card.effect.type && card.effect.type.startsWith('counter');
}

export async function checkRivalCounterOrResponse() {
  if (spellStack.length === 0) return false;

  await sleep(600);

  const responseIndex = state.rivalHand.findIndex(c => {
    if (!c.type.includes('Instantáneo') || !canRivalAfford(c)) return false;

    if (isCounterSpell(c)) {
      if (c.effect.type === 'counter_creature') {
        return spellStack.some(s => s.isLocal && s.card?.type?.includes('Criatura'));
      }
      if (c.effect.type === 'counter_non_creature') {
        return spellStack.some(s => s.isLocal && !s.card?.type?.includes('Criatura'));
      }
      return spellStack.some(s => s.isLocal);
    }
    return true;
  });

  if (responseIndex !== -1) {
    const responseCard = state.rivalHand.splice(responseIndex, 1)[0];
    tapRivalLandsFor(responseCard);

    let targetObj = null;
    if (isCounterSpell(responseCard)) {
      const topLocalSpell = [...spellStack].reverse().find(s => s.isLocal);
      if (topLocalSpell) {
        targetObj = { type: 'stack', stackId: topLocalSpell.id };
      }
    } else if (responseCard.effect?.type === 'damage') {
      targetObj = { type: 'player', isLocal: true };
    }

    addToStack({
      card: responseCard,
      isLocal: false,
      targetObj: targetObj,
      type: 'instant'
    });

    // --- CÓDIGO AGREGADO PARA DEVOLVER PRIORIDAD ---
    state.priorityPlayer = 'local';
    state.consecutivePasses = 0;
    // -----------------------------------------------
    
    logMsg(`🔴 ¡El Tano te respondió en velocidad instantánea con "${responseCard.name}"!`);
    render();
    return true;
  }
  return false;
}

// --- EVALUACIÓN TÁCTICA DE ATAQUE ---
function shouldRivalAttackWith(attackerItem) {
  const atkPower = getEffectivePower(attackerItem);
  const atkHasMenace = hasKeyword(attackerItem, 'menace');
  const hasVigilance = hasKeyword(attackerItem, 'vigilance');

  const validBlockers = state.localCombat.filter(b => !b.tapped && canBlock(attackerItem, b));

  if (validBlockers.length === 0) return true;
  if (atkHasMenace && validBlockers.length < 2) return true;

  const dueledBlockers = validBlockers.map(b => ({ b, duel: predictDuel(attackerItem, b) }));

  const freeKillAvailable = dueledBlockers.some(({ duel }) => duel.attackerDies && !duel.blockerDies);
  if (freeKillAvailable) return false;

  const getsAGoodTrade = dueledBlockers.some(({ duel }) => duel.blockerDies);
  if (getsAGoodTrade) return true;

  return hasVigilance;
}

// NUEVO: SISTEMA DE PRIORIDAD DEL BOT (Remplaza startRivalTurn)
export async function takeBotPriorityAction() {
  if (state.gameOver || state.priorityPlayer !== 'rival') return;

  await sleep(600); // El Tano "piensa"

  // 1. Responder a la pila
  if (spellStack.length > 0) {
    const responded = await checkRivalCounterOrResponse();
    if (!responded) {
      logMsg(`👁️ El Tano revisó su mano, no tiene respuestas y pasa prioridad.`);
      passPriority('rival');
    }
    return; // Si respondió, addToStack ya manejará los pases de prioridad
  }

  // 2. Acciones de Fase Principal (Solo en el turno del Tano)
  if (state.activePlayer === 'rival' && (state.phase === 'main1' || state.phase === 'main2')) {
    
    // Intentar bajar tierra
    const landIndex = state.rivalHand.findIndex(c => c.type.includes('Tierra'));
    if (landIndex !== -1 && !state.rivalLandPlayedThisTurn) {
      const landCard = state.rivalHand.splice(landIndex, 1)[0];
      state.rivalLands.push({ card: landCard, tapped: false }); 
      state.rivalLandPlayedThisTurn = true;
      logMsg(`El Tano bajó una tierra: ${landCard.name}.`); 
      render(); 
      await sleep(800);
    }
    
    const getAffordableMainPhaseCardIndex = () => {
      return state.rivalHand.findIndex(c => {
        if (c.type.includes('Tierra') || !canRivalAfford(c)) return false;
        if (isCounterSpell(c)) return false;
        return true;
      });
    };
    
    let affordableIndex = getAffordableMainPhaseCardIndex();  
    
    if (affordableIndex !== -1) {
      const cardToPlay = state.rivalHand.splice(affordableIndex, 1)[0];
      tapRivalLandsFor(cardToPlay);

      const isPermanent = cardToPlay.type.includes('Artefacto') || (cardToPlay.type.includes('Encantamiento') && !cardToPlay.adjunta);
      
      let stackType = 'spell';
      let aiTargetObj = null;
      let validPlay = true;

      if (cardToPlay.power !== undefined) {
        stackType = 'summon';
      } else if (isPermanent) {
        stackType = 'permanent';
        // --- LÓGICA HEXPROOF PARA EL BOT ---
        if (cardToPlay.requiresTarget && cardToPlay.etbEffect) {
          if (cardToPlay.etbEffect.type === 'damage') {
            aiTargetObj = { type: 'player', isLocal: true };
          } else {
            const validLocalTargets = state.localCombat.filter(c => !hasKeyword(c, 'hexproof'));
            if (validLocalTargets.length > 0) {
              aiTargetObj = { type: 'creature', isLocal: true, index: 0, item: validLocalTargets[0] };
            } else {
              aiTargetObj = { type: 'player', isLocal: true };
            }
          }
        }
      } else if (cardToPlay.adjunta) {
        stackType = 'aura';
        if (state.rivalCombat.length > 0) {
          aiTargetObj = { type: 'creature', isLocal: false, item: state.rivalCombat[0] };
        } else {
          validPlay = false;
          logMsg(`El Tano no tenía criaturas para encantar con ${cardToPlay.name} y lo descartó.`);
          state.rivalGraveyard.push(cardToPlay);
        }
      } else {
        stackType = cardToPlay.type.includes('Instantáneo') ? 'instant' : 'spell';
        if (cardToPlay.effect && cardToPlay.effect.type === 'damage') {
          aiTargetObj = { type: 'player', isLocal: true };
        } else if (cardToPlay.effect && cardToPlay.effect.type === 'heal') {
          aiTargetObj = { type: 'player', isLocal: false };
        }
      }

      if (validPlay) {
        addToStack({
          card: cardToPlay,
          isLocal: false,
          targetObj: aiTargetObj,
          type: stackType
        });

        // --- CÓDIGO AGREGADO PARA DEVOLVER PRIORIDAD ---
        state.priorityPlayer = 'local';
        state.consecutivePasses = 0;
        // -----------------------------------------------
        
        logMsg(`⏳ El Tano puso ${cardToPlay.name} en la pila. Tenés la prioridad para responder.`);
        render();
        return; // Retorna para esperar resolución. El ciclo de prioridad continuará después.
      }
    }
  }

  // 3. Fase de Declaración de Atacantes (Turno del Tano)
  if (state.activePlayer === 'rival' && state.phase === 'combat_attackers') {
    let attackCount = 0;
    let heldBackCount = 0;
    state.rivalCombat.forEach(unit => {
      if (hasKeyword(unit, 'defender')) return;

      if (!unit.tapped && !unit.summoningSickness) {
        if (shouldRivalAttackWith(unit)) {
          unit.isAttacking = true;
          if (!hasKeyword(unit, 'vigilance')) {
            unit.tapped = true;
          }
          attackCount++;
        } else {
          heldBackCount++;
        }
      }
    });

    if (heldBackCount > 0) logMsg(`🧠 El Tano decide guardar ${heldBackCount} criatura(s) atrás para defender.`);
    if (attackCount > 0) logMsg(`⚠️ ¡El Tano te ataca con ${attackCount} criatura(s)!`);
    else logMsg("El Tano no atacó con nada.");
    
    render();
    passPriority('rival'); // Termina de declarar atacantes
    return;
  }

  // 4. Fase de Declaración de Bloqueadores (Tu Turno)
  if (state.activePlayer === 'local' && state.phase === 'combat_blockers') {
    assignBotBlockers(); // Llama a la lógica inteligente de combate
    render();
    passPriority('rival');
    return;
  }

  // 5. Si no hizo nada de lo anterior, pasa prioridad
  passPriority('rival');
}
