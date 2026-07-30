// js/stackManager.js

import { logMsg, render } from './ui.js';
import { state, resolveEffectDirect, attachAura } from './main.js';
import { sleep } from './utils.js';
import { checkDeaths } from './combatRules.js';

// Estado global de la pila
export const spellStack = [];

/**
 * Agrega un elemento a la pila y redibuja la UI
 */
export function addToStack(item) {
  spellStack.push(item);
  logMsg(`⚡ "${item.card.name}" entró a la pila.`);
  renderStack();
}

/**
 * Resuelve el elemento superior (LIFO - el último ingresado)
 */
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

/**
 * Ejecuta la lógica física/matemática del elemento
 */
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

  // 3. Hechizos Instantáneos / Conjuros
  if (type === 'spell') {
    let effectToApply = card.effect;

    if (targetObj) {
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
    
    if (isLocal) state.localGraveyard.push(card);
    else state.rivalGraveyard.push(card);
  }
}

/**
 * Renderiza la interfaz gráfica de la pila en pantalla
 */
export function renderStack() {
  const container = document.getElementById('stack-container');
  const list = document.getElementById('stack-list');
  const countSpan = document.getElementById('stack-count');
  const btnResolve = document.getElementById('btn-resolve-top');

  if (!container || !list) return;

  // Si la pila está vacía, ocultamos la ventana flotante
  if (spellStack.length === 0) {
    container.classList.add('hidden');
    return;
  }

  // Si hay elementos, la mostramos
  container.classList.remove('hidden');
  countSpan.textContent = spellStack.length;
  list.innerHTML = '';

  // Dibujamos cada item (el elemento en la cima es el último índice)
  spellStack.forEach((item, index) => {
    const isTop = index === spellStack.length - 1;
    const cardDiv = document.createElement('div');
    
    cardDiv.className = `stack-item-card ${item.isLocal ? 'local' : 'rival'} ${isTop ? 'top-item' : ''}`;
    
    let targetText = 'Sin objetivo';
    if (item.targetObj) {
      if (item.targetObj.type === 'player') {
        targetText = `Objetivo: ${item.targetObj.isLocal ? 'Vos' : 'Rival'}`;
      } else if (item.targetObj.type === 'creature') {
        targetText = `Objetivo: ${item.targetObj.item.card.name}`;
      }
    }

    const ownerText = item.isLocal ? 'Vos' : 'El Tano';

    cardDiv.innerHTML = `
      <div class="stack-item-title">${isTop ? '▶ ' : ''}${item.card.name}</div>
      <div class="stack-item-meta">Lanzado por: <strong>${ownerText}</strong></div>
      <div class="stack-item-meta">${targetText}</div>
    `;

    list.appendChild(cardDiv);
  });

  // Evento para el botón de resolver el elemento del Top
  if (btnResolve) {
    btnResolve.onclick = () => resolveTopStackItem();
  }
}
