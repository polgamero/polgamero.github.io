import { addToStack, spellStack } from './stackManager.js';
import { cardDb } from './cardLoader.js';
import { executeLocalAttack, executeRivalAttack, resolveCombatDamage, checkDeaths } from './combatRules.js';
import { checkRivalCounterOrResponse } from './bot.js';
import { setupBoardLayout, render, logMsg, els, showGameOverOverlay, getTargetRules } from './ui.js';
import { buildRandomDeck, parseManaCost, getLandColor, sleep } from './utils.js';
import { checkGameOver, attemptPassTurn, handleDiscardClick, passTurnToRival, startLocalTurn, passPriority } from './turnManager.js';
import { hasKeyword, canBlock } from './keywords.js';

export { logMsg, render } from './ui.js';
export { parseManaCost, getLandColor, sleep } from './utils.js';
export { checkGameOver, attemptPassTurn, handleDiscardClick, passTurnToRival, startLocalTurn, passPriority } from './turnManager.js';

export const state = {
  turnCount: 1,
  isPlayerTurn: true,
  activePlayer: 'local',    // 'local' o 'rival'
  priorityPlayer: 'local',  // 'local' o 'rival'
  consecutivePasses: 0,
  
  // Fases: 'untap', 'upkeep', 'draw', 'main1', 
  // 'combat_begin', 'combat_attackers', 'combat_blockers', 'combat_damage', 'combat_end',
  // 'main2', 'end_step', 'cleanup'
  phase: 'main1', 
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
  cardsToDiscard: 0,

  damageModalOpen: false
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

  els.rivalHpBar.parentElement.addEventListener('click', () => handlePlayerTargetClick(false));
  els.localHpBar.parentElement.addEventListener('click', () => handlePlayerTargetClick(true));

  render();
  logMsg("¡Arranca la partida! Robaste tus 7 cartas iniciales.");
  logMsg("¡Tu turno! Bajá una tierra para empezar.");
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
  if (state.damageModalOpen) return;

  if (state.pendingTargetCard) {
    if (state.pendingTargetCard.effect && state.pendingTargetCard.effect.type && state.pendingTargetCard.effect.type.startsWith('counter')) {
      logMsg("¡Ojo! Un counterspell debe apuntar a la pila, no a una criatura.");
      return;
    }

    if (!isLocal && hasKeyword(item, 'hexproof')) {
      logMsg(`🛡️ ¡Epa! ${item.card.name} tiene Intocable. No podés seleccionarlo como objetivo.`);
      return;
    }
    
    const rules = getTargetRules(state.pendingTargetCard);
    const allowed = isLocal ? rules.allowLocalCreature : rules.allowRivalCreature;

    if (!allowed) {
      logMsg(`Ese no es un objetivo válido para ${state.pendingTargetCard.name}.`);
      return;
    }
    executeSpellOnTarget({ type: 'creature', isLocal, index, item });
    return;
  }

 // Declarar atacantes solo en sub-paso de atacantes
  if (state.phase === 'combat_attackers' && isLocal && state.activePlayer === 'local' && state.priorityPlayer === 'local') {
    if (hasKeyword(item, 'defender')) {
      logMsg(`🛡️ ${item.card.name} es Defensor y no puede atacar.`);
      return;
    }
    if (item.summoningSickness) {
      logMsg(`Tu ${item.card.name} está mareado y no puede atacar este turno.`);
      return;
    }
    if (item.tapped) return; 
    
    item.isAttacking = !item.isAttacking;
    render();
  }
  else if (state.phase === 'combat_blockers' && state.activePlayer === 'rival' && state.priorityPlayer === 'local') {
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
        const localUnit = state.localCombat[state.pendingBlockerIndex];
        if (!canBlock(item, localUnit)) {
           logMsg(`❌ Bloqueo ilegal: ${item.card.name} tiene Volar. Tu ${localUnit.card.name} necesita Volar o Alcance.`);
           return;
        }

        state.localCombat[state.pendingBlockerIndex].blockingIndex = index;
        logMsg(`Asignaste a ${state.localCombat[state.pendingBlockerIndex].card.name} a bloquear a ${item.card.name}.`);
        state.pendingBlockerIndex = null;
        render();
      }
    }
  }
}

export function handlePlayerTargetClick(isLocal) {
  if (state.damageModalOpen) return;
  if (state.pendingTargetCard) {
    if (state.pendingTargetCard.effect && state.pendingTargetCard.effect.type && state.pendingTargetCard.effect.type.startsWith('counter')) {
      logMsg("¡Ojo! Un counterspell debe apuntar a la pila, no a un jugador.");
      return;
    }
    
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

export function canPlayCard(card) {
  if (state.gameOver || state.pendingSpellIndex !== null || state.damageModalOpen) return false;
  if (state.priorityPlayer !== 'local') return false; // Solo si poseés prioridad
  
  const isInstant = card.type.includes('Instantáneo');

  // Si la pila no está vacía, solo instantáneos
  if (spellStack && spellStack.length > 0) return isInstant;

  if (card.effect && card.effect.type && card.effect.type.startsWith('counter')) {
    const rivalSpells = spellStack.filter(s => !s.isLocal);
    if (rivalSpells.length === 0) return false; 
  }
  
  // Si la pila está vacía, sorceries/creaturas solo en sus fases principales con su turno activo
  if (isInstant) return true;
  return state.activePlayer === 'local' && (state.phase === 'main1' || state.phase === 'main2');
}

export function playCard(index) {
  const card = state.localHand[index];
  
  if (!canPlayCard(card)) {
    logMsg(`⚠️ No podés jugar ${card.name} en este momento.`);
    return;
  }

  if (card.type.includes('Tierra')) {
    if (state.localLandPlayedThisTurn) { logMsg("Ya bajaste una tierra en este turno."); return; }
    if (state.activePlayer !== 'local' || (state.phase !== 'main1' && state.phase !== 'main2')) {
      logMsg("Solo podés bajar tierras en tus Fases Principales.");
      return;
    }
    state.localLands.push({ card, tapped: false }); state.localHand.splice(index, 1); state.localLandPlayedThisTurn = true;
    logMsg(`Bajaste la tierra: ${card.name}.`); render(); return;
  }

  if (card.effect && card.effect.type && card.effect.type.startsWith('counter')) {
    if (!spellStack || spellStack.length === 0) {
      logMsg(`⚠️ No hay ningún hechizo en la pila para contrarrestar.`);
      return;
    }
  }

  state.pendingSpellIndex = index; 
  state.pendingCost = parseManaCost(card.manaCost); 
  state.tappedLandsThisSpell = [];
  logMsg(`Preparando: ${card.name}. Seleccioná tierras para pagar.`);
  checkPaymentComplete(); 
  render();
}

export function tapLocalLand(item) {
  if (state.gameOver || item.tapped) return;
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
    
    const needsTarget = card.adjunta || (card.requiresTarget ?? (card.effect && (card.effect.type === 'damage' || card.effect.type === 'heal' || card.effect.type.startsWith('counter'))));
    if (needsTarget) {
      state.pendingTargetCard = card;
      state.pendingTargetSource = null; 
      
      let targetHint = `Hacé clic en un jugador o criatura para aplicar ${card.name}.`;
      if (card.adjunta) targetHint = `Hacé clic en una de tus criaturas para encantarla con ${card.name}.`;
      else if (card.effect && card.effect.type.startsWith('counter')) {
        targetHint = `Hacé clic en el hechizo de la Pila que querés contrarrestar.`;
      }
      
      logMsg(`¡Maná pagado! ${targetHint}`);
      return;
    }

    state.localHand.splice(state.pendingSpellIndex, 1);
    
    let stackType = 'spell';
    if (card.power !== undefined) stackType = 'summon';
    else if (isPermanent) stackType = 'permanent';
    else if (card.type.includes('Instantáneo')) stackType = 'instant';

    addToStack({
      card: card,
      isLocal: true,
      targetObj: null,
      type: stackType
    });

    state.consecutivePasses = 0; // Reinicia pases
    state.pendingSpellIndex = null;
    state.pendingCost = null;
    state.tappedLandsThisSpell = [];
    render();

    checkRivalCounterOrResponse();
  }
}

function executeSpellOnTarget(targetObj) {
  if (!state.pendingTargetCard) return;

  let card;
  let isPermanentSource = state.pendingTargetSource !== null;

  if (isPermanentSource) {
    card = state.pendingTargetSource.item.card;
    addToStack({
      card: card,
      isLocal: true,
      targetObj: targetObj,
      type: 'ability',
      source: state.pendingTargetSource
    });
  } 
  else {
    card = state.localHand.splice(state.pendingSpellIndex, 1)[0];

    let stackType = 'spell';
    const isPermanent = card.type.includes('Artefacto') || (card.type.includes('Encantamiento') && !card.adjunta);
    
    if (card.power !== undefined) stackType = 'summon';
    else if (isPermanent) stackType = 'permanent';
    else if (card.adjunta) stackType = 'aura';
    else if (card.type.includes('Instantáneo')) stackType = 'instant';

    addToStack({
      card: card,
      isLocal: true,
      targetObj: targetObj,
      type: stackType
    });

    state.pendingSpellIndex = null;
    state.pendingCost = null;
    state.tappedLandsThisSpell = [];
  }

  state.consecutivePasses = 0;
  state.pendingTargetCard = null;
  state.pendingTargetSource = null;
  render();

  checkRivalCounterOrResponse();
}

export function handleSupportClick(item, isLocal, index) {
  if (state.damageModalOpen) return;
  if (!isLocal || state.priorityPlayer !== 'local' || state.gameOver) return;

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

initGame();
