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

// NUEVO: Evaluación táctica para activar artefactos y soporte
export function tryActivateBotAbilities() {
  // Recorremos los artefactos en la mesa del Tano
  for (let i = 0; i < state.rivalSupport.length; i++) {
    const supportItem = state.rivalSupport[i];
    const card = supportItem.card;
    
    // Si no tiene habilidad activable o ya está girado y la requiere, pasamos
    if (!card.activatedAbility) continue;
    const ability = card.activatedAbility;
    const requiresTap = ability.cost.includes('{T}');
    if (requiresTap && supportItem.tapped) continue;

    // Extraemos el costo de maná para ver si el Tano lo puede pagar
    const manaCostString = ability.cost.replace('{T}', '').replace(',', '').trim();
    const dummyCardForCost = { manaCost: manaCostString || null };
    
    if (dummyCardForCost.manaCost && !canRivalAfford(dummyCardForCost)) continue;

    let shouldActivate = false;
    let aiTargetObj = null;

    // 🧠 CEREBRO DEL TANO: ¿Cuándo y a quién activar?
    if (ability.effect.type === 'crew_vehicle') {
      // Tripular la Carreta Blindada solo en main1 para poder atacar con ella
      if (state.phase === 'main1') shouldActivate = true;
    } 
    else if (ability.effect.type === 'attach_equipment') {
      // Equipar el Facón en main1 a su criatura más fuerte que no esté girada
      if (state.phase === 'main1' && state.rivalCombat.length > 0) {
         const bestTargets = state.rivalCombat.filter(c => !c.tapped);
         if (bestTargets.length > 0) {
           const chosen = bestTargets.reduce((prev, current) => 
              (getEffectivePower(prev) > getEffectivePower(current)) ? prev : current
           );
           aiTargetObj = { type: 'creature', isLocal: false, item: chosen };
           shouldActivate = true;
         }
      }
    }
    else if (ability.effect.type === 'heal' || ability.effect.type === 'draw') {
      // Tomar Mate o usar la Imprenta: priorizar en main2 si sobra maná, o si está perdiendo sangre
      if (state.phase === 'main2' || (ability.effect.type === 'heal' && state.rivalHP <= 12)) {
        aiTargetObj = ability.requiresTarget ? { type: 'player', isLocal: false } : null;
        shouldActivate = true;
      }
    }
    else if (ability.effect.type === 'damage') {
      // Boleadoras: Tratar de matar una criatura tuya molesta, o pegarte directo en main2
      if (state.localCombat.length > 0) {
        const vulnerable = state.localCombat.find(c => 
          !hasKeyword(c, 'hexproof') && getEffectiveToughness(c) <= ability.effect.amount
        );
        if (vulnerable) {
           aiTargetObj = { type: 'creature', isLocal: true, index: state.localCombat.indexOf(vulnerable), item: vulnerable };
           shouldActivate = true;
        }
      }
      // Si no hay criaturas vulnerables y está cerrando el turno, te pega a la cara
      if (!shouldActivate && state.phase === 'main2') {
         aiTargetObj = { type: 'player', isLocal: true };
         shouldActivate = true;
      }
    }

    // ⚡ EJECUCIÓN
    if (shouldActivate) {
      if (dummyCardForCost.manaCost) tapRivalLandsFor(dummyCardForCost);
      if (requiresTap) supportItem.tapped = true;

      addToStack({
        card: card,
        isLocal: false,
        targetObj: aiTargetObj,
        type: 'ability',
        source: { type: 'support_activation', index: i }
      });

      // Devolvemos la prioridad al jugador para que pueda responder
      state.priorityPlayer = 'local';
      state.consecutivePasses = 0;
      
      logMsg(`⚙️ El Tano activó la habilidad de ${card.name}. Tenés prioridad para responder.`);
      render();
      return true; // Retornamos true para pausar su loop de toma de decisiones
    }
  }
  return false;
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

    // --- NUEVO: Intentar activar habilidades de artefactos primero ---
    const abilityActivated = tryActivateBotAbilities();
    if (abilityActivated) return; // Si activó algo, la función corta y espera resolución
    // -----------------------------------------------------------------
    
    const getAffordableMainPhaseCardIndex = () => {
      return state.rivalHand.findIndex(c => {
        if (c.type.includes('Tierra') || !canRivalAfford(c)) return false;
        if (isCounterSpell(c)) return false;
        // NUEVO: El Tano solo arrasa el campo si está en desventaja de poder
        if (c.effect && c.effect.type === 'destroy_all_creatures') {
          const localPower = state.localCombat.reduce((sum, u) => sum + getEffectivePower(u), 0);
          const rivalPower = state.rivalCombat.reduce((sum, u) => sum + getEffectivePower(u), 0);
          if (rivalPower >= localPower) return false;
        }
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
        // LÓGICA NUEVA: REMOCIÓN DE CRIATURA (Yuyo del Loco, etc.)
        else if (cardToPlay.effect && cardToPlay.effect.type === 'destroy_creature') {
          const validTargets = state.localCombat.filter(c => !hasKeyword(c, 'hexproof'));
          if (validTargets.length > 0) {
            // El Tano apunta a tu criatura más grande (poder + resistencia)
            const chosen = validTargets.reduce((prev, current) =>
              (getEffectivePower(prev) + getEffectiveToughness(prev)) > (getEffectivePower(current) + getEffectiveToughness(current)) ? prev : current
            );
            aiTargetObj = { type: 'creature', isLocal: true, item: chosen };
          } else {
            validPlay = false;
            logMsg(`El Tano no tenía objetivos válidos para ${cardToPlay.name} y lo descartó.`);
            state.rivalGraveyard.push(cardToPlay);
          }
        }
        // LÓGICA NUEVA: REBOTE (Vuelto en Mano, etc.)
        else if (cardToPlay.effect && cardToPlay.effect.type === 'bounce') {
          const validTargets = state.localCombat.filter(c => !hasKeyword(c, 'hexproof'));
          if (validTargets.length > 0) {
            // El Tano apunta a tu criatura con más poder (la más amenazante en combate)
            const chosen = validTargets.reduce((prev, current) =>
              getEffectivePower(prev) > getEffectivePower(current) ? prev : current
            );
            aiTargetObj = { type: 'creature', isLocal: true, item: chosen };
          } else {
            validPlay = false;
            logMsg(`El Tano no tenía objetivos válidos para ${cardToPlay.name} y lo descartó.`);
            state.rivalGraveyard.push(cardToPlay);
          }
        }
        // LÓGICA NUEVA: DESCARTE (Corralito, etc.)
        else if (cardToPlay.effect && cardToPlay.effect.type === 'discard') {
          aiTargetObj = { type: 'player', isLocal: true };
        }
        // LÓGICA NUEVA: DESTRUIR PERMANENTE (Piedrazo a la Vidriera / Yuyerío Salvaje)
        else if (cardToPlay.effect && (cardToPlay.effect.type === 'destroy_artifact' || cardToPlay.effect.type === 'destroy_enchantment')) {
          const filterType = cardToPlay.effect.type === 'destroy_artifact' ? 'Artefacto' : 'Encantamiento';
          const validTargets = state.localSupport.filter(s => s.card.type.includes(filterType));
          if (validTargets.length > 0) {
            aiTargetObj = { type: 'permanent', isLocal: true, item: validTargets[0] };
          } else {
            validPlay = false;
            logMsg(`El Tano no tenía objetivos válidos para ${cardToPlay.name} y lo descartó.`);
            state.rivalGraveyard.push(cardToPlay);
          }
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
