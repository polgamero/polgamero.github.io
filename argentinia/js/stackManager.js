import { sleep } from './utils.js';
import { state, resolveEffectDirect, attachAura, cancelPayment } from './main.js';
import { logMsg, render } from './ui.js';
import { checkDeaths } from './combatRules.js';

export const spellStack = [];
let nextStackId = 1;

export function addToStack(item) {
  item.id = nextStackId++;
  spellStack.push(item);
  logMsg(`⚡ "${item.card.name}" entró a la pila (ID: ${item.id}).`);
  renderStack();
}

export async function resolveTopStackItem() {
  if (spellStack.length === 0) return;

  const item = spellStack.pop();
  logMsg(`✨ Resolviendo de la pila: ${item.card.name}`);
  
  await executeStackItem(item);
  renderStack();
  
  if (typeof render === 'function') {
    render();
  }
}

async function executeStackItem(item) {
  const { card, isLocal, targetObj, type } = item;

  // 1. Permanentes (Criaturas, Artefactos, Encantamientos)
  if (type === 'summon' || type === 'permanent') {
    if (card.power !== undefined) {
      const newCreature = { 
        card, 
        tapped: false, 
        summoningSickness: true, 
        isAttacking: false, 
        blockingIndex: null, 
        damageTaken: 0, 
        auras: [] 
      };
      const board = isLocal ? state.localCombat : state.rivalCombat;
      board.push(newCreature);
      logMsg(`¡${card.name} entró al campo de batalla!`);

      if (card.etbEffect) {
        if (card.requiresTarget) {
          state.pendingTargetCard = card;
          state.pendingTargetSource = { type: 'etb', item: newCreature };
          logMsg(`¡Efecto activado! Elegí un objetivo para ${card.name}.`);
        } else {
          resolveEffectDirect(card.etbEffect, card.name, isLocal);
        }
      }
    } else {
      const supportItem = { card, tapped: false };
      const supportZone = isLocal ? state.localSupport : state.rivalSupport;
      supportZone.push(supportItem);
      logMsg(`¡${card.name} entró a la zona de soporte!`);

      if (card.etbEffect) {
        if (card.requiresTarget) {
          state.pendingTargetCard = card;
          state.pendingTargetSource = { type: 'etb', item: supportItem };
          logMsg(`¡Efecto activado! Elegí un objetivo para ${card.name}.`);
        } else {
          resolveEffectDirect(card.etbEffect, card.name, isLocal);
        }
      }
    }
    return;
  }

  // 2. Auras
  if (type === 'aura' && targetObj && targetObj.item) {
    attachAura(card, targetObj.item);
    return;
  }

 // 3. Instantáneos / Conjuros / Contrahechizos / HABILIDADES (NUEVO)
  if (type === 'spell' || type === 'instant' || type === 'ability') {
    
    // Extraemos el efecto correcto dependiendo de qué originó la habilidad
    let effectToApply = card.effect;
    
    if (type === 'ability') {
      if (item.source && item.source.type === 'etb') {
        effectToApply = card.etbEffect;
      } else if (item.source && item.source.type === 'support_activation' && card.activatedAbility) {
        effectToApply = card.activatedAbility.effect;
      }
    }

    // A) Lógica de Contrahechizo (Target a la Pila)
    if (effectToApply && effectToApply.type === 'counter') {
      if (targetObj && targetObj.type === 'stack') {
        const targetIndex = spellStack.findIndex(s => s.id === targetObj.stackId);
        if (targetIndex !== -1) {
          const counteredItem = spellStack.splice(targetIndex, 1)[0];
          logMsg(`🚫 ¡${card.name} contrarrestó a "${counteredItem.card.name}"!`);
          if (counteredItem.isLocal) state.localGraveyard.push(counteredItem.card);
          else state.rivalGraveyard.push(counteredItem.card);
        } else {
          logMsg(`⚠️ ${card.name} falló: el hechizo objetivo ya no está en la pila.`);
        }
      } else {
        // Si no se eligió objetivo específico, contrarresta el último hechizo de la pila si existe
        if (spellStack.length > 0) {
          const counteredItem = spellStack.pop();
          logMsg(`🚫 ¡${card.name} contrarrestó a "${counteredItem.card.name}"!`);
          if (counteredItem.isLocal) state.localGraveyard.push(counteredItem.card);
          else state.rivalGraveyard.push(counteredItem.card);
        } else {
          logMsg(`⚠️ ${card.name} se resolvió sin efecto (no había hechizos en la pila).`);
        }
      }
    } 
    // B) Lógica de Daño / Cura
    else if (targetObj) {
      if (targetObj.type === 'player') {
        const targetName = targetObj.isLocal ? "vos" : "el Tano";
        if (effectToApply.type === 'damage') {
          if (targetObj.isLocal) state.localHP -= effectToApply.amount; 
          else state.rivalHP -= effectToApply.amount;
          logMsg(`💥 ¡${card.name}! Le hizo ${effectToApply.amount} de daño a ${targetName}.`);
        } else if (effectToApply.type === 'heal') {
          if (targetObj.isLocal) state.localHP += effectToApply.amount; 
          else state.rivalHP += effectToApply.amount;
          logMsg(`💚 ¡${card.name}! Curó ${effectToApply.amount} de HP a ${targetName}.`);
        }
      } else if (targetObj.type === 'creature') {
        const targetUnit = targetObj.item;
        if (effectToApply.type === 'damage') {
          targetUnit.damageTaken += effectToApply.amount;
          logMsg(`💥 ¡${card.name}! Le hizo ${effectToApply.amount} de daño a ${targetUnit.card.name}.`);
          checkDeaths(state.localCombat, state.localGraveyard, "Vos");
          checkDeaths(state.rivalCombat, state.rivalGraveyard, "El Tano");
        }
      }
    } else {
      resolveEffectDirect(effectToApply, card.name, isLocal);
    }
    
    // El hechizo resuelto va al cementerio (EXCEPTO si es una habilidad activada de un permanente)
    if (type !== 'ability') {
      if (isLocal) state.localGraveyard.push(card);
      else state.rivalGraveyard.push(card);
    }
  }
}

export function handleStackCardClick(item) {
  if (!state.pendingTargetCard) return;

  const effectType = state.pendingTargetCard.effect?.type;

  // Verificamos si es un counter genérico o de criatura
  if (effectType === 'counter' || effectType === 'counter_creature') {
    
    // Si es exclusivo de criatura (Derecho de Admisión), validamos el objetivo
    if (effectType === 'counter_creature') {
      const targetTypeStr = item.card?.type || "";
      if (!targetTypeStr.includes('Criatura')) {
        logMsg("❌ Derecho de Admisión solo puede contrarrestar hechizos de criatura.");
        return;
      }
    }

    // A PARTIR DE ACÁ, ES TU LÓGICA ORIGINAL INTACTA
    const spellIndex = state.pendingSpellIndex;

    // Mover carta de la mano
    const playedCard = state.localHand.splice(spellIndex, 1)[0];

    addToStack({
      card: playedCard,
      isLocal: true,
      targetObj: { type: 'stack', stackId: item.id },
      type: 'instant'
    });

    // Limpiar estados pendientes
    state.pendingSpellIndex = null;
    state.pendingCost = null;
    state.pendingTargetCard = null;

    logMsg(`🎯 Apuntaste ${playedCard.name} hacia "${item.card.name}" en la pila.`);
    render();
  }
}

export function renderStack() {
  const container = document.getElementById('stack-container');
  const list = document.getElementById('stack-list');
  const countSpan = document.getElementById('stack-count');
  const btnResolve = document.getElementById('btn-resolve-top');

  if (!container || !list) return;

  if (spellStack.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  countSpan.textContent = spellStack.length;
  list.innerHTML = '';

  const pendingEffect = state.pendingTargetCard?.effect?.type;
  
  // Es clickeable si estamos tirando un counter general, o si tiramos uno de criatura Y el ítem es criatura
  const isTargetingCounter = 
    pendingEffect === 'counter' || 
    (pendingEffect === 'counter_creature' && item.card?.type?.includes('Criatura'));

  spellStack.forEach((item, index) => {
    const isTop = index === spellStack.length - 1;
    const cardDiv = document.createElement('div');
    
    const targetableClass = isTargetingCounter ? 'targetable-stack' : '';
    cardDiv.className = `stack-item-card ${item.isLocal ? 'local' : 'rival'} ${isTop ? 'top-item' : ''} ${targetableClass}`;
    
    let targetText = 'Sin objetivo';
    if (item.targetObj) {
      if (item.targetObj.type === 'player') {
        targetText = `Objetivo: ${item.targetObj.isLocal ? 'Vos' : 'Rival'}`;
      } else if (item.targetObj.type === 'creature') {
        targetText = `Objetivo: ${item.targetObj.item.card.name}`;
      } else if (item.targetObj.type === 'stack') {
        targetText = `Objetivo: Hechizo en pila #${item.targetObj.stackId}`;
      }
    }

    const ownerText = item.isLocal ? 'Vos' : 'El Tano';

    cardDiv.innerHTML = `
      <div class="stack-item-title">${isTop ? '▶ ' : ''}${item.card.name}</div>
      <div class="stack-item-meta">Lanzado por: <strong>${ownerText}</strong></div>
      <div class="stack-item-meta">${targetText}</div>
    `;

    if (isTargetingCounter) {
      cardDiv.addEventListener('click', () => handleStackCardClick(item));
    }

    list.appendChild(cardDiv);
  });

  if (btnResolve) {
    btnResolve.textContent = "Pasar Prioridad / Resolver ➔";
    btnResolve.onclick = () => {
      // Si tocás resolver mientras estabas eligiendo tierras, se cancela tu jugada
      if (state.pendingSpellIndex !== null) {
        cancelPayment();
      }
      resolveTopStackItem();
    };
  }
}
