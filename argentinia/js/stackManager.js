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
    let newPermanentItem; 

    if (card.power !== undefined) {
      newPermanentItem = { 
        card, 
        tapped: false, 
        summoningSickness: true, 
        isAttacking: false, 
        blockingIndex: null, 
        damageTaken: 0, 
        auras: [] 
      };
      const board = isLocal ? state.localCombat : state.rivalCombat;
      board.push(newPermanentItem);
      logMsg(`¡${card.name} entró al campo de batalla!`);
    } else {
      newPermanentItem = { card, tapped: false };
      const supportZone = isLocal ? state.localSupport : state.rivalSupport;
      supportZone.push(newPermanentItem);
      logMsg(`¡${card.name} entró a la zona de soporte!`);
    }

// REPARACIÓN BUG 1: Milonga de Medianoche y ETBs con objetivo
    if (card.etbEffect) {
      if (card.requiresTarget && targetObj) {
        // Resolvemos el efecto directamente sin crear una nueva habilidad en la pila
        let effectToApply = card.etbEffect;
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
            // Acá podrías llamar a checkDeaths() si lo tenés importado
          }
        }
      } else {
        resolveEffectDirect(card.etbEffect, card.name, isLocal);
      }
    }
    return;
  }

  // 2. Auras
  if (type === 'aura' && targetObj && targetObj.item) {
    attachAura(card, targetObj.item);
    return;
  }

  // 3. Instantáneos / Conjuros / Contrahechizos / HABILIDADES
  if (type === 'spell' || type === 'instant' || type === 'ability') {
    
    let effectToApply = card.effect;
    
    if (type === 'ability') {
      if (item.source && item.source.type === 'etb') {
        effectToApply = card.etbEffect;
      } else if (item.source && item.source.type === 'support_activation' && card.activatedAbility) {
        effectToApply = card.activatedAbility.effect;
      }
    }

    // REPARACIÓN BUG 2: startsWith('counter') para validar tipos derivados (ej. counter_creature)
    if (effectToApply && effectToApply.type && effectToApply.type.startsWith('counter')) {
      if (targetObj && targetObj.type === 'stack') {
        const targetIndex = spellStack.findIndex(s => s.id === targetObj.stackId);
        if (targetIndex !== -1) {
          const counteredItem = spellStack.splice(targetIndex, 1)[0];
          logMsg(`🚫 ¡${card.name} contrarrestó a "${counteredItem.card.name}"!`);
          if (counteredItem.isLocal) state.localGraveyard.push(counteredItem.card);
          else state.rivalGraveyard.push(counteredItem.card);
          
          // Procesamiento seguro de efectos secundarios (Ej: Derecho de Admisión -> add_counter)
          if (card.secondaryEffect && card.secondaryEffect.type === 'add_counter') {
            const friendlyBoard = isLocal ? state.localCombat : state.rivalCombat;
            if (friendlyBoard.length > 0) {
              const buffTarget = friendlyBoard[0]; // Aplica al primer aliado disponible
              if (!buffTarget.auras) buffTarget.auras = [];
              
              // Inyectamos el contador aprovechando tu sistema de auras existente
              buffTarget.auras.push({
                name: 'Contador +1/+1',
                auraEffect: { stats: { signo: '+', cantidad: 1 } }
              });
              logMsg(`💪 Además, ${card.name} le puso un contador +1/+1 a ${buffTarget.card.name}.`);
            }
          }

        } else {
          logMsg(`⚠️ ${card.name} falló: el hechizo objetivo ya no está en la pila.`);
        }
      } else {
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
  //const isTargetingCounter = 
  //pendingEffect === 'counter' || 
  //(pendingEffect === 'counter_creature' && item.card?.type?.includes('Criatura'));

  spellStack.forEach((item, index) => {
    const isTop = index === spellStack.length - 1;
    const cardDiv = document.createElement('div');

    const isCounterNonCreature = pendingEffect === 'counter_non_creature' && !item.card?.type?.includes('Criatura');
    const isCounterCreature = pendingEffect === 'counter_creature' && item.card?.type?.includes('Criatura');
    const isGenericCounter = pendingEffect === 'counter' || pendingEffect === 'counter_unless_pay';
    
    const isTargetingCounter = isGenericCounter || isCounterCreature || isCounterNonCreature;
    
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
