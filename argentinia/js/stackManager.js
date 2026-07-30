// js/stackManager.js

import { logMsg, render } from './ui.js';
import { state, resolveEffectDirect, attachAura } from './main.js';
import { sleep } from './utils.js';

// Nuestra Pila (LIFO: Last In, First Out)
export const spellStack = [];

/**
 * Agrega un hechizo, habilidad o permanente a la pila.
 * @param {Object} stackItem - Objeto que representa el hechizo.
 */
export function addToStack(stackItem) {
  spellStack.push(stackItem);
  logMsg(`⚡ [PILA] ${stackItem.card.name} entró a la pila.`);
  
  // Aquí dispararemos el chequeo de prioridad en el futuro (Etapa 4)
  // Por ahora, para probar que no se rompa nada, la resolvemos automáticamente tras un breve delay.
  setTimeout(resolveStack, 1000); 
}

/**
 * Resuelve la pila desde el último elemento agregado hacia el primero.
 */
export async function resolveStack() {
  if (spellStack.length === 0) return;

  logMsg("🔄 Resolviendo la pila...");
  
  while (spellStack.length > 0) {
    // LIFO: sacamos el último que entró
    const topItem = spellStack.pop(); 
    logMsg(`✨ Resolviendo: ${topItem.card.name}`);
    
    // Ejecutamos la lógica según el tipo de hechizo
    await executeStackItem(topItem);
    
    // Renderizamos y pausamos para darle "jugabilidad" visual
    render();
    await sleep(800); 
  }
  
  logMsg("✅ Pila vacía.");
}

/**
 * Ejecuta el efecto real que estaba esperando en la pila.
 */
async function executeStackItem(item) {
  const { card, isLocal, targetObj, type } = item;

  // 1. Criaturas y Permanentes entran al campo
  if (type === 'summon') {
    if (card.power !== undefined) {
      item.destinationArray.push(item.entityObj);
      logMsg(`¡${card.name} entró al campo de batalla!`);
      // Si tiene efecto de entrada (ETB), lo disparamos directo (o a la pila de nuevo si quisiéramos ser puristas)
      if (card.etbEffect && !card.requiresTarget) {
          resolveEffectDirect(card.etbEffect, card.name, isLocal);
      }
    } else {
      item.destinationArray.push(item.entityObj);
      logMsg(`¡${card.name} entró a la zona de soporte!`);
    }
    return;
  }

  // 2. Auras
  if (type === 'aura' && targetObj && targetObj.item) {
    attachAura(card, targetObj.item);
    return;
  }

  // 3. Hechizos (Daño, Robo, Cura, etc.) con o sin objetivo
  if (type === 'spell') {
    let effectToApply = card.effect;

    if (targetObj) {
      // Tiene objetivo
      if (targetObj.type === 'player') {
        const targetName = targetObj.isLocal ? "vos" : "el Tano";
        if (effectToApply.type === 'damage') {
          if (targetObj.isLocal) state.localHP -= effectToApply.amount; else state.rivalHP -= effectToApply.amount;
          logMsg(`💥 ¡${card.name}! Le hizo ${effectToApply.amount} de daño a ${targetName}.`);
        } else if (effectToApply.type === 'heal') {
          if (targetObj.isLocal) state.localHP += effectToApply.amount; else state.rivalHP += effectToApply.amount;
          logMsg(`💚 ¡${card.name}! Curó ${effectToApply.amount} de HP a ${targetName}.`);
        }
      } else if (targetObj.type === 'creature') {
        const targetUnit = targetObj.item;
        if (effectToApply.type === 'damage') {
          targetUnit.damageTaken += effectToApply.amount;
          logMsg(`💥 ¡${card.name}! Le hizo ${effectToApply.amount} de daño a ${targetUnit.card.name}.`);
          // Nota: Deberíamos importar y llamar a checkDeaths aquí
        }
      }
    } else {
      // No tiene objetivo específico
      resolveEffectDirect(effectToApply, card.name, isLocal);
    }
    
    // Al resolverse un hechizo (Inst/Conj), va al cementerio
    if (isLocal) {
        state.localGraveyard.push(card);
    } else {
        state.rivalGraveyard.push(card);
    }
  }
}