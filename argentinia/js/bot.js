import { hasKeyword, canBlock } from './keywords.js';

import {
  state,
  logMsg,
  render,
  parseManaCost,
  getLandColor,
  startLocalTurn,
  sleep,
  getEffectivePower,
  getEffectiveToughness
} from './main.js';

import { resolveCombatDamage } from './combatRules.js';
import { addToStack, spellStack } from './stackManager.js';

// NUEVO: El Tano se queda mirando la mesa hasta que la pila se vacíe
function waitForStackToResolve() {
  return new Promise(resolve => {
    const checkInterval = setInterval(() => {
      // Si la pila está vacía, dejamos de esperar y la promesa se cumple
      if (spellStack.length === 0) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 250); // Revisa cada cuarto de segundo
  });
}

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

    logMsg(`🔴 ¡El Tano te respondió en velocidad instantánea con "${responseCard.name}"!`);
    render();
    return true;
  } else {
    logMsg(`👁️ El Tano revisó su mano, no tiene respuestas y pasa prioridad.`);
    return false;
  }
}

// --- NUEVO: EVALUACIÓN TÁCTICA DE ATAQUE ---
// Decide si le conviene al Tano atacar con una criatura puntual, en vez de
// mandar siempre a todo el mundo. Analiza el peor bloqueo que vos le podrías
// armar y decide si vale la pena arriesgarse o si es mejor quedarse a defender.
function shouldRivalAttackWith(attackerItem) {
  const atkPower = getEffectivePower(attackerItem);
  const atkTough = getEffectiveToughness(attackerItem);
  const atkHasMenace = hasKeyword(attackerItem, 'menace');
  const atkHasDeathtouch = hasKeyword(attackerItem, 'deathtouch');
  const hasVigilance = hasKeyword(attackerItem, 'vigilance');

  // Bloqueadores tuyos que legalmente podrían pararlo (respeta Volar/Alcance)
  const validBlockers = state.localCombat.filter(b => !b.tapped && canBlock(attackerItem, b));

  // Nadie te lo puede bloquear: pega gratis, siempre conviene.
  if (validBlockers.length === 0) return true;

  // Tiene Amenaza y no juntás 2 bloqueadores válidos: pasa igual, es gratis.
  if (atkHasMenace && validBlockers.length < 2) return true;

  const wouldKillAttacker = (blocker) => {
    const bPower = getEffectivePower(blocker);
    const blockerHasDeathtouch = hasKeyword(blocker, 'deathtouch');
    return bPower >= atkTough || (blockerHasDeathtouch && bPower > 0);
  };
  const wouldKillBlocker = (blocker) => {
    const bTough = getEffectiveToughness(blocker);
    return atkPower >= bTough || (atkHasDeathtouch && atkPower > 0);
  };

  // Si existe UN bloqueador que lo mata gratis (lo frena y sobrevive), el Tano
  // asume que se lo vas a poner y evita el ataque suicida, tenga o no vigilance.
  const freeKillAvailable = validBlockers.some(b => wouldKillAttacker(b) && !wouldKillBlocker(b));
  if (freeKillAvailable) return false;

  // Si al menos con algún bloqueo se lleva puesta una criatura tuya (trade
  // parejo o mejor), vale la pena atacar aunque no tenga vigilance.
  const getsAGoodTrade = validBlockers.some(b => wouldKillBlocker(b));
  if (getsAGoodTrade) return true;

  // Último caso: lo bloquean pero no muere nadie de los dos lados.
  // Sin Vigilance, atacar solo lo tapa sin ganar nada -> mejor se queda a defender.
  // Con Vigilance no pierde nada por intentarlo (sigue pudiendo bloquear).
  return hasVigilance;
}

export async function startRivalTurn() {
  if (state.gameOver) return;
  state.rivalLandPlayedThisTurn = false;
  state.rivalLands.forEach(l => l.tapped = false);
  state.rivalCombat.forEach(c => { c.tapped = false; c.summoningSickness = false; c.isAttacking = false; c.blockingIndex = null; c.damageTaken = 0; });
  state.rivalSupport.forEach(s => s.tapped = false);
  if (state.rivalDeck.length > 0) state.rivalHand.push(state.rivalDeck.pop());
  render(); if (state.gameOver) return; await sleep(1000); if (state.gameOver) return;

  const landIndex = state.rivalHand.findIndex(c => c.type.includes('Tierra'));
  if (landIndex !== -1 && !state.rivalLandPlayedThisTurn) {
    const landCard = state.rivalHand.splice(landIndex, 1)[0];
    state.rivalLands.push({ card: landCard, tapped: false }); state.rivalLandPlayedThisTurn = true;
    logMsg(`El Tano bajó una estancia: ${landCard.name}.`); render(); if (state.gameOver) return; await sleep(1000);
  }
  
  const getAffordableMainPhaseCardIndex = () => {
  return state.rivalHand.findIndex(c => {
    if (c.type.includes('Tierra') || !canRivalAfford(c)) return false;
    // En su turno principal, el bot NO tira counters de la nada
    if (isCounterSpell(c)) {
      return false;
    }
    return true;
  });
  };
  
  let affordableIndex = getAffordableMainPhaseCardIndex();  
  
  // Ahora es un bucle que sabe "pausarse" de verdad
  while(affordableIndex !== -1) {
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
      
      // NUEVO: Si el permanente es como "La Milonga" y requiere objetivo al entrar
      if (cardToPlay.requiresTarget && cardToPlay.etbEffect) {
        if (cardToPlay.etbEffect.type === 'damage') {
          // Si hace daño, el Tano te apunta directo a la cara
          aiTargetObj = { type: 'player', isLocal: true };
        } else {

          // --- NUEVO: LÓGICA HEXPROOF PARA EL BOT ---
          // Filtramos tus criaturas para excluir las que tienen Hexproof
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
      
      logMsg(`⏳ El Tano puso ${cardToPlay.name} en la pila. Tenés la prioridad para responder.`);
      render();

      // CORRECCIÓN CLAVE: En vez de hacer 'return', pausamos la función hasta que vos resuelvas la pila
      await waitForStackToResolve();
      
      // Una vez que la pila se resolvió, le damos 1 segundo de respiro antes de seguir
      await sleep(1000);
      if (state.gameOver) return;
    }

    render(); if (state.gameOver) return; await sleep(1000);
    // Volvemos a buscar si el Tano puede jugar otra cosa con el maná que le sobra
    affordableIndex = getAffordableMainPhaseCardIndex();
  }

  // Si ya no puede (o no quiere) jugar nada más, evalúa la Fase de Combate
  let attackCount = 0;
  let heldBackCount = 0;
  state.rivalCombat.forEach(unit => {
    if (!unit.tapped && !unit.summoningSickness) {
      if (shouldRivalAttackWith(unit)) {
        unit.isAttacking = true;
        // --- Chequeo de Vigilance: no se gira al atacar ---
        if (!hasKeyword(unit, 'vigilance')) {
          unit.tapped = true;
        }
        attackCount++;
      } else {
        heldBackCount++;
      }
    }
  });

  if (heldBackCount > 0) {
    logMsg(`🧠 El Tano decide guardar ${heldBackCount} criatura(s) atrás para defender.`);
  }

  if (attackCount > 0) {
    const localHasUntappedBlockers = state.localCombat.some(c => !c.tapped);
    
    if (localHasUntappedBlockers) {
      state.phase = 'local_block';
      logMsg(`⚠️ ¡El Tano te ataca con ${attackCount} criatura(s)! Asigná tus bloqueadores y confirmá.`);
      render();
    } else {
      logMsg(`⚠️ ¡El Tano te ataca con ${attackCount} criatura(s) y no tenés defensores!`);
      resolveCombatDamage(state.rivalCombat, state.localCombat, false);
      await sleep(1500);
      discardExcessRivalHand();
      startLocalTurn();
    }
  } else {
    logMsg("El Tano no atacó con nada.");
    await sleep(1000);
    discardExcessRivalHand();
    startLocalTurn();
  }
}

function discardExcessRivalHand() {
  const rivalExcess = state.rivalHand.length - 7;
  if (rivalExcess > 0) {
    for (let i = 0; i < rivalExcess; i++) {
      const randomIndex = Math.floor(Math.random() * state.rivalHand.length);
      const discardedCard = state.rivalHand.splice(randomIndex, 1)[0];
      state.rivalGraveyard.push(discardedCard);
      logMsg(`🗑️ El Tano descartó ${discardedCard.name} por límite de mano.`);
    }
  }
}
