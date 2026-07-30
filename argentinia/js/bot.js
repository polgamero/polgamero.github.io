import {
  state,
  logMsg,
  render,
  parseManaCost,
  getLandColor,
  resolveEffectDirect,
  attachAura,
  resolveSpellDirect,
  startLocalTurn,
  sleep
} from './main.js';

import { resolveCombatDamage } from './combatRules.js';

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

  let affordableIndex = state.rivalHand.findIndex(c => !c.type.includes('Tierra') && canRivalAfford(c));
  while(affordableIndex !== -1) {
    const cardToPlay = state.rivalHand.splice(affordableIndex, 1)[0];
    
    const cost = parseManaCost(cardToPlay.manaCost);
    const totalCost = cost.W + cost.U + cost.B + cost.R + cost.G + cost.generic;
    
    tapRivalLandsFor(cardToPlay);

    const isPermanent = cardToPlay.type.includes('Artefacto') || (cardToPlay.type.includes('Encantamiento') && !cardToPlay.adjunta);

    if (cardToPlay.power !== undefined) {
      state.rivalCombat.push({ card: cardToPlay, tapped: false, summoningSickness: true, isAttacking: false, blockingIndex: null, damageTaken: 0, auras: [] });
      logMsg(`¡El Tano invocó a ${cardToPlay.name}!`);
    } else if (isPermanent) {
      const supportItem = { card: cardToPlay, tapped: false };
      state.rivalSupport.push(supportItem);
      logMsg(`¡El Tano bajó ${cardToPlay.name} a su zona de soporte!`);

      if (cardToPlay.etbEffect) {
        resolveEffectDirect(cardToPlay.etbEffect, cardToPlay.name, false);
      }
    } else if (cardToPlay.adjunta) {
      if (state.rivalCombat.length > 0) {
        attachAura(cardToPlay, state.rivalCombat[0]);
      } else {
        logMsg(`El Tano no tenía criaturas para encantar con ${cardToPlay.name} y lo descartó.`);
        state.rivalGraveyard.push(cardToPlay);
      }
    } else {
      logMsg(`El Tano usó: ${cardToPlay.name}`); 
      resolveSpellDirect(cardToPlay, false);
      state.rivalGraveyard.push(cardToPlay);
    }
    render(); if (state.gameOver) return; await sleep(1000);
    affordableIndex = state.rivalHand.findIndex(c => !c.type.includes('Tierra') && canRivalAfford(c));
  }

  let attackCount = 0;
  state.rivalCombat.forEach(unit => {
    if (!unit.tapped && !unit.summoningSickness) {
      unit.isAttacking = true;
      unit.tapped = true; 
      attackCount++;
    }
  });

  if (attackCount > 0) {
    const localHasUntappedBlockers = state.localCombat.some(c => !c.tapped);
    
    if (localHasUntappedBlockers) {
      state.phase = 'local_block';
      logMsg(`⚠️ ¡El Tano te ataca con ${attackCount} criatura(s)! Asigná tus bloqueadores y confirmá (o dejá pasar el daño).`);
      render();
    } else {
      logMsg(`⚠️ ¡El Tano te ataca con ${attackCount} criatura(s) y no tenés defensores disponibles!`);
      resolveCombatDamage(state.rivalCombat, state.localCombat, false);
      await sleep(1500);
        const rivalExcess = state.rivalHand.length - 7;
        if (rivalExcess > 0) {
          for (let i = 0; i < rivalExcess; i++) {
          const randomIndex = Math.floor(Math.random() * state.rivalHand.length);
          const discardedCard = state.rivalHand.splice(randomIndex, 1)[0];
          state.rivalGraveyard.push(discardedCard);
          logMsg(`🗑️ El Tano descartó ${discardedCard.name} por límite de mano.`);
          }
        }
      startLocalTurn();
    }
  } else {
    logMsg("El Tano no atacó con nada.");
    await sleep(1000);
      const rivalExcess = state.rivalHand.length - 7;
      if (rivalExcess > 0) {
      for (let i = 0; i < rivalExcess; i++) {
        const randomIndex = Math.floor(Math.random() * state.rivalHand.length);
        const discardedCard = state.rivalHand.splice(randomIndex, 1)[0];
        state.rivalGraveyard.push(discardedCard);
        logMsg(`🗑️ El Tano descartó ${discardedCard.name} por límite de mano.`);
        }
      }
    startLocalTurn();
  }
}