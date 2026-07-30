import { cardDb } from './cardLoader.js';
import { executeLocalAttack, executeRivalAttack, resolveCombatDamage, checkDeaths } from './combatRules.js';
import { startRivalTurn } from './bot.js';
import { setupBoardLayout, render, logMsg, els, showGameOverOverlay, getTargetRules } from './ui.js';
import { buildRandomDeck, parseManaCost, getLandColor, sleep } from './utils.js';

export { logMsg, render } from './ui.js';
export { parseManaCost, getLandColor, sleep } from './utils.js';

export const state = {
  turnCount: 1,
  isPlayerTurn: true,
  phase: 'main', 
  gameOver: false,

  localHP: 20,
  localDeck: [],
  localHand: [],
  localLands: [],
  localCombat: [],
  localGraveyard: [], 
  localLandPlayedThisTurn: false,

  rivalHP: 20,
  rivalDeck: [],
  rivalHand: [],
  rivalLands: [],
  rivalCombat: [],
  rivalGraveyard: [], 
  rivalLandPlayedThisTurn: false,

  pendingSpellIndex: null, 
  pendingCost: null,       
  tappedLandsThisSpell: [],
  pendingTargetCard: null,
  
  pendingBlockerIndex: null,
  
  localSupport: [],
  rivalSupport: [],
  pendingTargetSource: null, 

  isDiscarding: false,
  cardsToDiscard: 0
};

async function initGame() {
  logMsg("Cargando el mazo...");
  await cardDb.loadAll();

  setupBoardLayout();

  state.localDeck = buildRandomDeck();
  state.rivalDeck = buildRandomDeck();

  for (let i = 0; i < 7; i++) {
    state.localHand.push(state.localDeck.pop());
    state.rivalHand.push(state.rivalDeck.pop());
  }

  els.btnRestart.addEventListener('click', () => location.reload());
  els.btnRestartSidebar.addEventListener('click', () => location.reload());

  els.rivalHpBar.parentElement.addEventListener('click', () => handlePlayerTargetClick(false));
  els.localHpBar.parentElement.addEventListener('click', () => handlePlayerTargetClick(true));

  render();
  logMsg("¡Arranca la partida! Robaste tus 7 cartas iniciales.");
  logMsg("¡Tu turno! Bajá una estancia para empezar.");
}

export function getEffectivePower(itemObj) {
  const card = itemObj.card || itemObj;
  let p = card.power || 0;
  (itemObj.auras || []).forEach(auraCard => {
    const mod = auraCard.auraEffect && auraCard.auraEffect.stats;
    if (mod) p += (mod.signo === '-' ? -1 : 1) * mod.cantidad;
  });
  return p;
}

export function getEffectiveToughness(itemObj) {
  const card = itemObj.card || itemObj;
  let t = card.toughness || 0;
  (itemObj.auras || []).forEach(auraCard => {
    const mod = auraCard.auraEffect && auraCard.auraEffect.stats;
    if (mod) t += (mod.signo === '-' ? -1 : 1) * mod.cantidad;
  });
  return t;
}

export function getEffectiveKeywords(itemObj) {
  const card = itemObj.card || itemObj;
  const base = card.keywords || [];
  const fromAuras = (itemObj.auras || []).flatMap(a => (a.auraEffect && a.auraEffect.keywords) || []);
  return [...new Set([...base, ...fromAuras])];
}

export function attachAura(auraCard, creatureItem) {
  if (!creatureItem.auras) creatureItem.auras = [];
  creatureItem.auras.push(auraCard);
  logMsg(`✨ ¡${auraCard.name} se pegó a ${creatureItem.card.name}!`);
}

export function handleCombatClick(item, isLocal, index) {
  if (state.pendingTargetCard) {
    const rules = getTargetRules(state.pendingTargetCard);
    const allowed = isLocal ? rules.allowLocalCreature : rules.allowRivalCreature;
    if (!allowed) {
      logMsg(`Ese no es un objetivo válido para ${state.pendingTargetCard.name}.`);
      return;
    }
    executeSpellOnTarget({ type: 'creature', isLocal, index, item });
    return;
  }

  if (state.phase === 'main' && isLocal && state.isPlayerTurn) {
    if (item.summoningSickness) {
      logMsg(`Tu ${item.card.name} está mareado y no puede atacar este turno.`);
      return;
    }
    if (item.tapped) return; 
    
    item.isAttacking = !item.isAttacking;
    render();
  } 
  else if (state.phase === 'local_block') {
    if (isLocal) {
      if (item.tapped) {
        logMsg("No podés bloquear con una criatura girada.");
        return;
      }
      state.pendingBlockerIndex = index;
      logMsg(`Seleccionaste ${item.card.name}. Ahora hacé clic en el atacante del Tano que querés bloquear.`);
      render();
    } else {
      if (state.pendingBlockerIndex !== null && item.isAttacking) {
        state.localCombat[state.pendingBlockerIndex].blockingIndex = index;
        logMsg(`Asignaste a ${state.localCombat[state.pendingBlockerIndex].card.name} a bloquear a ${item.card.name}.`);
        state.pendingBlockerIndex = null;
        render();
      }
    }
  }
}

export function handlePlayerTargetClick(isLocal) {
  if (state.pendingTargetCard) {
    const rules = getTargetRules(state.pendingTargetCard);
    if (!rules.allowPlayer) {
      logMsg(`${state.pendingTargetCard.name} necesita una criatura como objetivo, no un jugador.`);
      return;
    }
    executeSpellOnTarget({ type: 'player', isLocal });
  }
}

export function cancelPayment() {
  if (state.pendingSpellIndex === null) return;
  state.tappedLandsThisSpell.forEach(land => land.tapped = false);
  state.pendingSpellIndex = null; state.pendingCost = null; state.tappedLandsThisSpell = []; state.pendingTargetCard = null;
  logMsg("Cancelaste el hechizo. Las tierras se enderezaron.");
  render();
}

export function checkGameOver() {
  if (state.gameOver) return;
  if (state.localHP <= 0) {
    state.gameOver = true; logMsg("💀 Te quedaste sin HP. ¡Ganó el Tano!"); showGameOverOverlay(false);
  } else if (state.rivalHP <= 0) {
    state.gameOver = true; logMsg("🏆 ¡VICTORIA! Hiciste morder el polvo al Tano."); showGameOverOverlay(true);
  }
}

export function playCard(index) {
  if (!state.isPlayerTurn || state.gameOver || state.pendingSpellIndex !== null) return; 
  const card = state.localHand[index];
  if (card.type.includes('Tierra')) {
    if (state.localLandPlayedThisTurn) { logMsg("Ya bajaste una estancia en este turno."); return; }
    state.localLands.push({ card, tapped: false }); state.localHand.splice(index, 1); state.localLandPlayedThisTurn = true;
    logMsg(`Bajaste la estancia: ${card.name}.`); render(); return;
  }
  state.pendingSpellIndex = index; state.pendingCost = parseManaCost(card.manaCost); state.tappedLandsThisSpell = [];
  logMsg(`Preparando: ${card.name}. Seleccioná tierras para pagar.`);
  checkPaymentComplete(); render();
}

export function tapLocalLand(item) {
  if (!state.isPlayerTurn || state.gameOver || item.tapped) return;
  if (state.pendingSpellIndex === null) { logMsg("Seleccioná primero un hechizo de tu mano para pagar."); return; }
  const landColor = getLandColor(item.card); let used = false;
  if (['W', 'U', 'B', 'R', 'G'].includes(landColor) && state.pendingCost[landColor] > 0) { state.pendingCost[landColor] -= 1; used = true; } 
  else if (state.pendingCost.generic > 0) { state.pendingCost.generic -= 1; used = true; }
  if (used) { item.tapped = true; state.tappedLandsThisSpell.push(item); checkPaymentComplete(); } 
  else { logMsg(`Esa yerba (${landColor}) no te sirve para este hechizo.`); }
  render();
}

function checkPaymentComplete() {
  if (state.pendingSpellIndex === null) return;
  const cost = state.pendingCost;
  if ((cost.W + cost.U + cost.B + cost.R + cost.G + cost.generic) === 0) {
    const card = state.localHand[state.pendingSpellIndex];
    
    const isPermanent = card.type.includes('Artefacto') || (card.type.includes('Encantamiento') && !card.adjunta);

    if (card.power !== undefined) {
      state.localHand.splice(state.pendingSpellIndex, 1);
      const newCreature = { 
        card, 
        tapped: false, 
        summoningSickness: true, 
        isAttacking: false, 
        blockingIndex: null, 
        damageTaken: 0, 
        auras: [] 
      };
      state.localCombat.push(newCreature);
      logMsg(`¡Invocaste a ${card.name}! (No puede atacar este turno)`);

      if (card.etbEffect) {
        if (card.requiresTarget) {
          state.pendingTargetCard = card;
          state.pendingTargetSource = { type: 'etb', item: newCreature };
          logMsg(`¡Efecto activado! Elegí un objetivo para ${card.name}.`);
        } else {
          resolveEffectDirect(card.etbEffect, card.name, true);
          render();
        }
      }

      state.pendingSpellIndex = null; 
      state.pendingCost = null; 
      state.tappedLandsThisSpell = [];
      
    } else if (isPermanent) {
      state.localHand.splice(state.pendingSpellIndex, 1);
      const supportItem = { card, tapped: false };
      state.localSupport.push(supportItem);
      logMsg(`¡Bajaste ${card.name} a tu zona de soporte!`);

      if (card.etbEffect) {
        if (card.requiresTarget) {
          state.pendingTargetCard = card;
          state.pendingTargetSource = { type: 'etb', item: supportItem };
          logMsg(`¡Efecto activado! Elegí un objetivo para ${card.name}.`);
        } else {
          resolveEffectDirect(card.etbEffect, card.name, true);
        }
      }
      state.pendingSpellIndex = null; state.pendingCost = null; state.tappedLandsThisSpell = [];

    } else {
      const needsTarget = card.adjunta || (card.requiresTarget ?? (card.effect && (card.effect.type === 'damage' || card.effect.type === 'heal')));
      if (needsTarget) {
        state.pendingTargetCard = card;
        state.pendingTargetSource = null; 
        const targetHint = card.adjunta ? `Hacé clic en una de tus criaturas para encantarla con ${card.name}.` : `Hacé clic en un jugador o criatura para aplicar ${card.name}.`;
        logMsg(`¡Maná pagado! ${targetHint}`);
      } else {
        state.localHand.splice(state.pendingSpellIndex, 1);
        resolveEffectDirect(card.effect, card.name, true);
        state.localGraveyard.push(card);
        state.pendingSpellIndex = null; state.pendingCost = null; state.tappedLandsThisSpell = [];
      }
    }
  }
}

function executeSpellOnTarget(targetObj) {
  if (!state.pendingTargetCard) return;

  let card;
  let effectToApply;
  let isPermanentSource = state.pendingTargetSource !== null;

  if (isPermanentSource) {
    card = state.pendingTargetSource.item.card;
    effectToApply = state.pendingTargetSource.type === 'etb' ? card.etbEffect : card.activatedAbility.effect;
  } else {
    card = state.localHand.splice(state.pendingSpellIndex, 1)[0];
    effectToApply = card.effect;
  }

  if (card.adjunta && !isPermanentSource) {
    attachAura(card, targetObj.item);
    state.pendingSpellIndex = null; state.pendingCost = null; state.tappedLandsThisSpell = []; state.pendingTargetCard = null;
    render();
    return;
  }

  if (targetObj.type === 'player') {
    const targetName = targetObj.isLocal ? "vos" : "el Tano";
    if (effectToApply.type === 'damage') {
      if (targetObj.isLocal) state.localHP -= effectToApply.amount; else state.rivalHP -= effectToApply.amount;
      logMsg(`💥 ¡${card.name}! Le hiciste ${effectToApply.amount} de daño a ${targetName}.`);
    } else if (effectToApply.type === 'heal') {
      if (targetObj.isLocal) state.localHP += effectToApply.amount; else state.rivalHP += effectToApply.amount;
      logMsg(`💚 ¡${card.name}! Le curaste ${effectToApply.amount} de HP a ${targetName}.`);
    }
  } else if (targetObj.type === 'creature') {
    const targetUnit = targetObj.item;
    if (effectToApply.type === 'damage') {
      targetUnit.damageTaken += effectToApply.amount;
      logMsg(`💥 ¡${card.name}! Le hiciste ${effectToApply.amount} de daño a ${targetUnit.card.name}.`);
      checkDeaths(state.localCombat, state.localGraveyard, "Vos");
      checkDeaths(state.rivalCombat, state.rivalGraveyard, "El Tano");
    }
  }

  if (!isPermanentSource) {
    state.localGraveyard.push(card);
    state.pendingSpellIndex = null; state.pendingCost = null; state.tappedLandsThisSpell = []; 
  }
  
  state.pendingTargetCard = null;
  state.pendingTargetSource = null;
  render();
}

export function handleSupportClick(item, isLocal, index) {
  if (!isLocal || !state.isPlayerTurn || state.phase !== 'main' || state.gameOver) return;

  const card = item.card;
  if (card.activatedAbility) {
    if (card.activatedAbility.cost === "{T}") {
      if (item.tapped) {
        logMsg(`El permanente ${card.name} ya está girado.`);
        return;
      }
      item.tapped = true;
      logMsg(`Giraste ${card.name} para usar su habilidad.`);

      if (card.activatedAbility.requiresTarget) {
        state.pendingTargetCard = card;
        state.pendingTargetSource = { type: 'support_activation', item };
        logMsg(`Seleccioná un objetivo para el efecto de ${card.name}.`);
        render();
      } else {
        resolveEffectDirect(card.activatedAbility.effect, card.name, true);
        render();
      }
    }
  }
}

export function resolveEffectDirect(effect, cardName, isLocal) {
  if(!effect) return;
  const targetName = isLocal ? "vos" : "el Tano";
  if (effect.type === 'draw') {
    for(let i=0; i<effect.amount; i++) {
      if(isLocal && state.localDeck.length > 0) state.localHand.push(state.localDeck.pop());
      if(!isLocal && state.rivalDeck.length > 0) state.rivalHand.push(state.rivalDeck.pop());
    }
    logMsg(`🃏 ¡${cardName}! ${targetName} robó ${effect.amount} cartas extras.`);
  } else if (effect.type === 'heal') {
    if (isLocal) state.localHP += effect.amount; else state.rivalHP += effect.amount;
    logMsg(`💚 ¡${cardName}! ${targetName} recuperó ${effect.amount} de HP.`);
  } else if (effect.type === 'damage') {
    if (isLocal) state.rivalHP -= effect.amount; else state.localHP -= effect.amount;
    logMsg(`💥 ¡${cardName}! ${targetName} hizo ${effect.amount} de daño.`);
  }
}

export function resolveSpellDirect(card, isLocal) { resolveEffectDirect(card.effect, card.name, isLocal); }

export function attemptPassTurn() {
  if (!state.isPlayerTurn || state.gameOver) return;

  if (state.isDiscarding) {
    logMsg("❌ ¡Epa! Primero tenés que descartar las cartas que te sobran.");
    return;
  }

  const excess = state.localHand.length - 7;
  
  if (excess > 0) {
    state.isDiscarding = true;
    state.cardsToDiscard = excess;
    logMsg(`⚠️ Tenés demasiadas cartas. Hacé clic en ${excess} carta(s) de tu mano para descartar.`);
    render(); 
  } else {
    logMsg("Terminás tu turno.");
    passTurnToRival();
  }
}

export function handleDiscardClick(index) {
  const discardedCard = state.localHand.splice(index, 1)[0];
  state.localGraveyard.push(discardedCard);
  state.cardsToDiscard--;
  
  logMsg(`🗑️ Descartaste ${discardedCard.name}.`);

  if (state.cardsToDiscard <= 0) {
    state.isDiscarding = false;
    logMsg("Mano en 7 cartas. ¡Turno del Tano!");
    passTurnToRival();
  }
  
  render();
}

async function passTurnToRival() {
  if (!state.isPlayerTurn || state.gameOver) return;
  state.isPlayerTurn = false;
  state.localCombat.forEach(c => c.isAttacking = false);
  els.btnEndTurn.textContent = "Turno Rival...";
  els.btnEndTurn.style.backgroundColor = "#7f8c8d";
  logMsg("Terminaste tu turno. El Tano está pensando...");
  
  state.localCombat.forEach(c => c.damageTaken = 0);
  state.rivalCombat.forEach(c => c.damageTaken = 0);
  
  render();
  setTimeout(startRivalTurn, 1500);
}

export function startLocalTurn() {
  if (state.gameOver) return;
  state.turnCount++;
  state.isPlayerTurn = true;
  state.phase = 'main';

  state.localLandPlayedThisTurn = false;
  state.localLands.forEach(l => l.tapped = false);
  state.localCombat.forEach(c => { c.tapped = false; c.summoningSickness = false; c.isAttacking = false; c.blockingIndex = null; c.damageTaken = 0; });
  state.rivalCombat.forEach(c => c.damageTaken = 0); 
  state.localSupport.forEach(s => s.tapped = false);

  if (state.localDeck.length > 0) {
    state.localHand.push(state.localDeck.pop());
    logMsg(`Turno ${state.turnCount}: Enderezaste y robaste una carta.`);
  }
  render();
}

initGame();