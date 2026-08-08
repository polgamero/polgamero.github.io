import { sleep } from './utils.js';
import { state, resolveEffectDirect, attachAura, cancelPayment, detachEquipmentFrom, sendAurasToGraveyard, triggerCreatureEtb, triggerCreatureDies, triggerAnyCreatureDeath, getEffectivePower, performSacrifice } from './main.js';
import { logMsg, render, createCardElement } from './ui.js';
import { checkDeaths } from './combatRules.js';
import { hasKeyword } from './keywords.js';
import { passPriority } from './turnManager.js';

export const spellStack = [];
let nextStackId = 1;
let nextEffectId = 1;

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
  
  // Tras resolver un objeto, la prioridad vuelve al jugador activo
  state.priorityPlayer = state.activePlayer;
  state.consecutivePasses = 0;

  renderStack();
  
  if (typeof render === 'function') {
    render();
  }
}

async function executeStackItem(item) {
  const { card, isLocal, targetObj, type } = item;

  if (type === 'summon' || type === 'permanent') {
    let newPermanentItem; 

    if (card.power !== undefined) {
      newPermanentItem = { 
        card, tapped: false, summoningSickness: true, isAttacking: false, 
        blockingIndex: null, damageTaken: 0, auras: [] 
      };

      if (hasKeyword(newPermanentItem, 'haste')) {
        newPermanentItem.summoningSickness = false;
      }
      
      const board = isLocal ? state.localCombat : state.rivalCombat;
      board.push(newPermanentItem);
      logMsg(`¡${card.name} entró al campo de batalla!`);
      triggerCreatureEtb(isLocal);

      // Regla de Leyenda: si ya tenías otra copia de esta misma Legendaria en el campo,
      // la recién llegada se sacrifica (simplificación: en MTG real elegís cuál te
      // quedás; acá se queda siempre la que ya estaba antes).
      if (card.type.includes('Legendaria')) {
        const duplicate = board.find(u => u !== newPermanentItem && u.card.name === card.name);
        if (duplicate) {
          logMsg(`⚖️ Regla de Leyenda: ya tenías a ${card.name} en el campo. La copia nueva se sacrifica.`);
          performSacrifice(newPermanentItem, isLocal);
        }
      }
    } else {
      // enteredThisTurn: para que un Vehículo recién jugado y tripulado en el mismo turno
      // respete el mareo de invocación al convertirse en criatura (ver crew_vehicle abajo).
      newPermanentItem = { card, tapped: false, enteredThisTurn: true };
      // Los Equipos entran al campo sin equipar a nadie todavía (se equipan pagando Equipar).
      if (card.equipment) newPermanentItem.attachedTo = null;
      const supportZone = isLocal ? state.localSupport : state.rivalSupport;
      supportZone.push(newPermanentItem);
      logMsg(`¡${card.name} entró a la zona de soporte!`);

      // Si es un Encantamiento estático que puede llevar resistencias a 0 (ej. Toque de
      // Queda), chequeamos muertes de inmediato, no solo tras el próximo daño de combate.
      if (card.staticEffect) {
        checkDeaths(state.localCombat, state.localGraveyard, "Vos");
        checkDeaths(state.rivalCombat, state.rivalGraveyard, "El Tano");
      }
    }

    if (card.etbEffect) {
      if (card.requiresTarget && targetObj) {
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
            checkDeaths(state.localCombat, state.localGraveyard, "Vos");
            checkDeaths(state.rivalCombat, state.rivalGraveyard, "El Tano");
          }
        } 
      } else {
        resolveEffectDirect(card.etbEffect, card.name, isLocal);
      }
    }
    return;
  }

  if (type === 'aura' && targetObj && targetObj.item) {
    attachAura(card, targetObj.item);
    // Si es una Aura-maldición (-X/-X), la criatura puede morir en el acto.
    checkDeaths(state.localCombat, state.localGraveyard, "Vos");
    checkDeaths(state.rivalCombat, state.rivalGraveyard, "El Tano");
    return;
  }

  if (type === 'spell' || type === 'instant' || type === 'ability') {
    let effectToApply = card.effect;
    
    if (type === 'ability') {
      if (item.source && item.source.type === 'etb') {
        effectToApply = card.etbEffect;
      } else if (item.source && item.source.type === 'support_activation' && card.activatedAbility) {
        effectToApply = card.activatedAbility.effect;
      } else if (item.source && item.source.type === 'equipped_activation' && card.grantedAbility) {
        // Habilidad que un Equipo le presta a la criatura que lo tiene puesto (ej. Facón de Plata).
        effectToApply = card.grantedAbility.effect;
      }
    }

    if (effectToApply && effectToApply.type && effectToApply.type.startsWith('counter')) {
      if (targetObj && targetObj.type === 'stack') {
        const targetIndex = spellStack.findIndex(s => s.id === targetObj.stackId);
        if (targetIndex !== -1) {
          const counteredItem = spellStack.splice(targetIndex, 1)[0];
          logMsg(`🚫 ¡${card.name} contrarrestó a "${counteredItem.card.name}"!`);
          if (counteredItem.isLocal) state.localGraveyard.push(counteredItem.card);
          else state.rivalGraveyard.push(counteredItem.card);
          
          if (card.secondaryEffect && card.secondaryEffect.type === 'add_counter') {
            const friendlyBoard = isLocal ? state.localCombat : state.rivalCombat;
            if (friendlyBoard.length > 0) {
              const buffTarget = friendlyBoard[0];
              if (!buffTarget.auras) buffTarget.auras = [];
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
          logMsg(`⚠️ ${card.name} se resolvió sin efecto.`);
        }
      }
    } 
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
        // LÓGICA NUEVA: DESCARTE
        else if (effectToApply.type === 'discard') {
          const targetHand = targetObj.isLocal ? state.localHand : state.rivalHand;
          const targetGraveyard = targetObj.isLocal ? state.localGraveyard : state.rivalGraveyard;
          const amount = Math.min(effectToApply.amount, targetHand.length);
          const discardedNames = [];
          for (let i = 0; i < amount; i++) {
            // El Tano descarta al azar; a vos te descartamos desde el final de la mano
            // (más adelante se puede pedir que elijas cuáles, por ahora es automático).
            const idx = targetObj.isLocal ? targetHand.length - 1 : Math.floor(Math.random() * targetHand.length);
            const discarded = targetHand.splice(idx, 1)[0];
            targetGraveyard.push(discarded);
            discardedNames.push(discarded.name);
          }
          if (discardedNames.length > 0) {
            logMsg(`🗑️ ¡${card.name}! ${targetName} descartó: ${discardedNames.join(', ')}.`);
          } else {
            logMsg(`🗑️ ¡${card.name}! ${targetName} no tenía cartas para descartar.`);
          }
        }
        // LÓGICA NUEVA: EFECTO GENÉRICO DE UNA SOLA APLICACIÓN (ej. Cuarentena Total)
        else if (effectToApply.type === 'prevent_attack') {
          const targetPlayer = targetObj.isLocal ? 'local' : 'rival';
          state.activeEffects.push({
            id: nextEffectId++,
            effectType: 'prevent_attack',
            targetPlayer,
            sourceName: card.name
          });
          logMsg(`🚫 ¡${card.name}! ${targetName} no va a poder atacar en su próxima fase de combate.`);
        }
      } else if (targetObj.type === 'creature') {
        const targetUnit = targetObj.item;
        if (effectToApply.type === 'damage') {
          targetUnit.damageTaken += effectToApply.amount;
          logMsg(`💥 ¡${card.name}! Le hizo ${effectToApply.amount} de daño a ${targetUnit.card.name}.`);
          checkDeaths(state.localCombat, state.localGraveyard, "Vos");
          checkDeaths(state.rivalCombat, state.rivalGraveyard, "El Tano");
        } 
        // LÓGICA NUEVA: EQUIPAR (real) — el Equipo que activó esta habilidad se adjunta a la criatura.
        // No se copia a `auras`: el Equipo sigue siendo su propio permanente en la zona de soporte,
        // simplemente ahora apunta con `attachedTo` a la criatura equipada.
        else if (effectToApply.type === 'attach_equipment') {
          const equipmentItem = item.sourceItem;
          if (equipmentItem) {
            equipmentItem.attachedTo = targetUnit;
            logMsg(`⚔️ ¡${card.name} fue equipado a ${targetUnit.card.name}!`);
          } else {
            logMsg(`⚠️ ${card.name} no pudo encontrar su propio permanente en la zona de soporte para equiparse.`);
          }
        }
        // LÓGICA NUEVA: PELEAR — la criatura "atacante" (la que activó esto, o si viene de
        // un hechizo, tu criatura con más poder) y la criatura objetivo se hacen daño mutuo
        // igual a su fuerza. No usa la pila para elegir la propia: viene resuelta de antemano.
        else if (effectToApply.type === 'fight') {
          let selfUnit = item.sourceItem;
          if (!selfUnit) {
            // Viene de un hechizo, no de la habilidad de una criatura: auto-elegimos tu
            // criatura con más poder para que sea la que pelea.
            const ownBoard = isLocal ? state.localCombat : state.rivalCombat;
            if (ownBoard.length > 0) {
              selfUnit = ownBoard.reduce((prev, current) => getEffectivePower(prev) > getEffectivePower(current) ? prev : current);
            }
          }
          if (selfUnit) {
            const selfPower = getEffectivePower(selfUnit);
            const targetPower = getEffectivePower(targetUnit);
            targetUnit.damageTaken = (targetUnit.damageTaken || 0) + selfPower;
            selfUnit.damageTaken = (selfUnit.damageTaken || 0) + targetPower;
            logMsg(`🥊 ¡${selfUnit.card.name} pelea contra ${targetUnit.card.name}! (${selfPower} vs ${targetPower} de daño)`);
            checkDeaths(state.localCombat, state.localGraveyard, "Vos");
            checkDeaths(state.rivalCombat, state.rivalGraveyard, "El Tano");
          } else {
            logMsg(`⚠️ ${card.name} no tenía ninguna criatura tuya para pelear.`);
          }
        }
        // LÓGICA NUEVA: TRUCO DE COMBATE — +X/+X hasta el final del turno (ej. Fuerza de Toro)
        else if (effectToApply.type === 'pump') {
          if (!targetUnit.tempEffects) targetUnit.tempEffects = [];
          targetUnit.tempEffects.push({ name: card.name, powerMod: effectToApply.powerMod, toughnessMod: effectToApply.toughnessMod });
          const pText = `${effectToApply.powerMod >= 0 ? '+' : ''}${effectToApply.powerMod}/${effectToApply.toughnessMod >= 0 ? '+' : ''}${effectToApply.toughnessMod}`;
          logMsg(`💪 ¡${card.name}! ${targetUnit.card.name} obtiene ${pText} hasta el final del turno.`);
        }
        // LÓGICA NUEVA: PROTECCIÓN TEMPORAL — otorga una keyword hasta el final del turno (ej. A Cubierto)
        else if (effectToApply.type === 'grant_keyword_temp') {
          if (!targetUnit.tempEffects) targetUnit.tempEffects = [];
          targetUnit.tempEffects.push({ name: card.name, keywords: [effectToApply.keyword] });
          logMsg(`🛡️ ¡${card.name}! ${targetUnit.card.name} gana ${effectToApply.keyword} hasta el final del turno.`);
        }
        // LÓGICA NUEVA: DESTRUIR CRIATURA
        else if (effectToApply.type === 'destroy_creature') {
          const isTargetLocal = state.localCombat.includes(targetUnit);
          const board = isTargetLocal ? state.localCombat : state.rivalCombat;
          const grave = isTargetLocal ? state.localGraveyard : state.rivalGraveyard;
          const idx = board.indexOf(targetUnit);
          if (idx !== -1) {
            if (hasKeyword(targetUnit, 'indestructible')) {
              logMsg(`🛡️ ${targetUnit.card.name} es Indestructible: ${card.name} no pudo hacer nada.`);
            } else {
              board.splice(idx, 1);
              detachEquipmentFrom(targetUnit, isTargetLocal);
              sendAurasToGraveyard(targetUnit, isTargetLocal);
              grave.push(targetUnit.card);
              logMsg(`💀 ¡${card.name} destruyó a ${targetUnit.card.name}!`);
              triggerCreatureDies(targetUnit, isTargetLocal);
              triggerAnyCreatureDeath(targetUnit, isTargetLocal);
            }
          } else {
            logMsg(`⚠️ ${card.name} falló: el objetivo ya no está en el campo.`);
          }
        }
        // LÓGICA NUEVA: REBOTE A LA MANO
        else if (effectToApply.type === 'bounce') {
          const isTargetLocal = state.localCombat.includes(targetUnit);
          const board = isTargetLocal ? state.localCombat : state.rivalCombat;
          const hand = isTargetLocal ? state.localHand : state.rivalHand;
          const idx = board.indexOf(targetUnit);
          if (idx !== -1) {
            board.splice(idx, 1);
            detachEquipmentFrom(targetUnit, isTargetLocal);
            sendAurasToGraveyard(targetUnit, isTargetLocal);
            // Si era un Vehículo tripulado, le sacamos las estadísticas temporales de criatura
            if (targetUnit.isVehicle) {
              delete targetUnit.card.power;
              delete targetUnit.card.toughness;
            }
            hand.push(targetUnit.card);
            logMsg(`🔄 ¡${card.name} devolvió a ${targetUnit.card.name} a la mano de su dueño!`);
          } else {
            logMsg(`⚠️ ${card.name} falló: el objetivo ya no está en el campo.`);
          }
        }
      }
      // LÓGICA NUEVA: DESTRUIR PERMANENTE (Artefacto / Encantamiento en la zona de soporte)
      else if (targetObj.type === 'permanent') {
        const targetItem = targetObj.item;
        const isTargetLocal = state.localSupport.includes(targetItem);
        const supportZone = isTargetLocal ? state.localSupport : state.rivalSupport;
        const grave = isTargetLocal ? state.localGraveyard : state.rivalGraveyard;
        const idx = supportZone.indexOf(targetItem);
        if ((effectToApply.type === 'destroy_artifact' || effectToApply.type === 'destroy_enchantment') && idx !== -1) {
          supportZone.splice(idx, 1);
          grave.push(targetItem.card);
          logMsg(`💥 ¡${card.name} destruyó a ${targetItem.card.name}!`);
          // Si era un Encantamiento estático (ej. Fuerza de la Manada), alguna criatura
          // que dependía de ese +1/+1 para sobrevivir podría morir ahora.
          if (targetItem.card.staticEffect) {
            checkDeaths(state.localCombat, state.localGraveyard, "Vos");
            checkDeaths(state.rivalCombat, state.rivalGraveyard, "El Tano");
          }
        } else if (idx === -1) {
          logMsg(`⚠️ ${card.name} falló: el objetivo ya no está en el campo.`);
        }
      }
    } else {
      // LÓGICA NUEVA: VEHÍCULOS (no requieren un targetObj externo porque se "activan" a sí mismos)
      if (effectToApply.type === 'crew_vehicle') {
        const supportZone = isLocal ? state.localSupport : state.rivalSupport;
        const combatZone = isLocal ? state.localCombat : state.rivalCombat;
        
        // Buscamos el vehículo en el soporte
        const vehicleIndex = supportZone.findIndex(s => s.card.id === card.id);
        if (vehicleIndex !== -1) {
          const vehicleItem = supportZone.splice(vehicleIndex, 1)[0];
          
          // Le pasamos los stats base para que se vuelva criatura temporal
          vehicleItem.card.power = card.baseStats.power;
          vehicleItem.card.toughness = card.baseStats.toughness;
          vehicleItem.isVehicle = true; // Flag clave para devolverlo después
          // Respeta el mareo de invocación: si el Vehículo entró este mismo turno, no puede
          // atacar apenas se tripula, igual que cualquier criatura recién jugada.
          vehicleItem.summoningSickness = !!vehicleItem.enteredThisTurn;
          
          combatZone.push(vehicleItem);
          logMsg(`🚗 ¡${card.name} fue tripulado y aceleró al campo de batalla como un ${card.baseStats.power}/${card.baseStats.toughness}!`);
        }
      }
      // LÓGICA NUEVA: ARRASAR EL CAMPO (board wipe)
      else if (effectToApply.type === 'destroy_all_creatures') {
        const wipeBoard = (combatZone, graveyard, isLocalZone) => {
          let count = 0;
          for (let i = combatZone.length - 1; i >= 0; i--) {
            const unit = combatZone[i];
            if (hasKeyword(unit, 'indestructible')) continue; // sobrevive al arrase
            combatZone.splice(i, 1);
            detachEquipmentFrom(unit, isLocalZone);
            sendAurasToGraveyard(unit, isLocalZone);
            if (unit.isVehicle) {
              delete unit.card.power;
              delete unit.card.toughness;
            }
            graveyard.push(unit.card);
            triggerCreatureDies(unit, isLocalZone);
            triggerAnyCreatureDeath(unit, isLocalZone);
            count++;
          }
          return count;
        };
        const localCount = wipeBoard(state.localCombat, state.localGraveyard, true);
        const rivalCount = wipeBoard(state.rivalCombat, state.rivalGraveyard, false);
        logMsg(`💥 ¡${card.name} arrasó con todo! (${localCount} tuya(s) + ${rivalCount} del Tano fueron al cementerio)`);
      }
      // LÓGICA NUEVA: CREAR FICHAS
      else if (effectToApply.type === 'create_tokens') {
        const board = isLocal ? state.localCombat : state.rivalCombat;
        const amount = effectToApply.amount || 1;
        for (let i = 0; i < amount; i++) {
          const tokenCard = {
            id: `token_${card.id}_${Date.now()}_${i}`,
            name: effectToApply.tokenName || 'Ficha',
            type: 'Criatura Token',
            manaCost: null,
            imagen: card.img,
            cmc: 0,
            rarity: 'Common',
            colors: card.colors || [],
            power: effectToApply.tokenStats?.power ?? 1,
            toughness: effectToApply.tokenStats?.toughness ?? 1,
            text: 'Token de criatura.',
            flavorText: '',
            keywords: effectToApply.tokenKeywords || [],
            isToken: true
          };
          const newTokenUnit = {
            card: tokenCard, tapped: false, summoningSickness: true, isAttacking: false,
            blockingIndex: null, damageTaken: 0, auras: []
          };
          if (hasKeyword(newTokenUnit, 'haste')) newTokenUnit.summoningSickness = false;
          board.push(newTokenUnit);
          triggerCreatureEtb(isLocal);
        }
        logMsg(`✨ ¡${card.name} creó ${amount} ficha(s) de "${effectToApply.tokenName}"!`);
      }
      // LÓGICA NUEVA: REANIMAR DESDE EL CEMENTERIO
      else if (effectToApply.type === 'reanimate') {
        const graveyard = isLocal ? state.localGraveyard : state.rivalGraveyard;
        const board = isLocal ? state.localCombat : state.rivalCombat;
        const amount = effectToApply.amount || 1;
        let revivedCount = 0;
        for (let i = 0; i < amount; i++) {
          // Buscamos la criatura que murió más recientemente (el final del cementerio)
          let targetIdx = -1;
          for (let j = graveyard.length - 1; j >= 0; j--) {
            if (graveyard[j].power !== undefined) { targetIdx = j; break; }
          }
          if (targetIdx === -1) break;

          const revivedCard = graveyard.splice(targetIdx, 1)[0];
          const newUnit = {
            card: revivedCard, tapped: false, summoningSickness: true, isAttacking: false,
            blockingIndex: null, damageTaken: 0, auras: []
          };
          if (hasKeyword(newUnit, 'haste')) newUnit.summoningSickness = false;
          board.push(newUnit);
          triggerCreatureEtb(isLocal);

          // Regla de Leyenda: también aplica si lo que reanimás ya tiene una copia viva
          if (revivedCard.type.includes('Legendaria')) {
            const duplicate = board.find(u => u !== newUnit && u.card.name === revivedCard.name);
            if (duplicate) {
              logMsg(`⚖️ Regla de Leyenda: ya tenías a ${revivedCard.name} en el campo. La reanimada se sacrifica.`);
              performSacrifice(newUnit, isLocal);
            }
          }

          revivedCount++;
        }
        if (revivedCount > 0) {
          logMsg(`⚰️ ¡${card.name} devolvió ${revivedCount} criatura(s) del cementerio al campo de batalla!`);
        } else {
          logMsg(`⚠️ ${card.name} no encontró ninguna criatura en el cementerio para revivir.`);
        }
      }
      // LÓGICA NUEVA: BUSCAR TIERRAS (rampa de maná)
      else if (effectToApply.type === 'ramp') {
        const deck = isLocal ? state.localDeck : state.rivalDeck;
        const landZone = isLocal ? state.localLands : state.rivalLands;
        const amount = effectToApply.amount || 1;
        let foundCount = 0;
        for (let i = 0; i < amount; i++) {
          // Filtramos específicamente "básica", como dice el texto de estas cartas
          // (antes buscaba cualquier tierra, incluidas duales o especiales).
          const idx = deck.findIndex(c => c.type.includes('Tierra') && c.type.includes('básica'));
          if (idx === -1) break;
          const landCard = deck.splice(idx, 1)[0];
          landZone.push({ card: landCard, tapped: !!landCard.entersTapped });
          foundCount++;
        }
        // Barajamos el resto del mazo tras buscar
        for (let i = deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        if (foundCount > 0) {
          logMsg(`🌱 ¡${card.name} buscó ${foundCount} tierra(s) y la(s) puso en el campo de batalla!`);
        } else {
          logMsg(`⚠️ ${card.name} no encontró tierras en el mazo.`);
        }
      }
      else {
        resolveEffectDirect(effectToApply, card.name, isLocal);
      }
    }
    
    if (type !== 'ability') {
      if (isLocal) state.localGraveyard.push(card);
      else state.rivalGraveyard.push(card);
    }
  }
}

export function handleStackCardClick(item) {
  if (!state.pendingTargetCard) return;

  const effectType = state.pendingTargetCard.effect?.type;

  if (effectType && effectType.startsWith('counter')) {
    const isCreatureSpell = item.type === 'summon' || item.card?.power !== undefined;

    if (effectType === 'counter_creature' && !isCreatureSpell) {
      logMsg("❌ Esta carta solo puede contrarrestar hechizos de criatura.");
      return;
    }

    if (effectType === 'counter_non_creature' && isCreatureSpell) {
      logMsg("❌ Esta carta solo puede contrarrestar hechizos que no sean de criatura.");
      return;
    }

    const spellIndex = state.pendingSpellIndex;
    const playedCard = state.localHand.splice(spellIndex, 1)[0];

    addToStack({
      card: playedCard,
      isLocal: true,
      targetObj: { type: 'stack', stackId: item.id },
      type: 'instant'
    });

    state.consecutivePasses = 0;
    state.pendingSpellIndex = null;
    state.pendingCost = null;
    state.pendingTargetCard = null;

    logMsg(`🎯 Apuntaste ${playedCard.name} hacia "${item.card.name}" en la pila.`);
    render();
  }
}

let stackPreviewEl = null;
function getStackPreviewEl() {
  if (!stackPreviewEl) {
    stackPreviewEl = document.createElement('div');
    stackPreviewEl.id = 'stack-hover-preview';
    document.body.appendChild(stackPreviewEl);
  }
  return stackPreviewEl;
}

function showStackHoverPreview(item, anchorEl) {
  const preview = getStackPreviewEl();
  preview.innerHTML = '';

  // zone: 'preview' no matchea ninguna rama de clicks de createCardElement, así que
  // esta carta queda puramente decorativa (no se le puede hacer click).
  const cardEl = createCardElement(item, false, item.isLocal, null, 'preview');
  cardEl.style.width = '190px';
  cardEl.style.height = `${190 * 7 / 5}px`;
  preview.appendChild(cardEl);

  const stackContainer = document.getElementById('stack-container');
  const containerRect = stackContainer.getBoundingClientRect();
  const anchorRect = anchorEl.getBoundingClientRect();

  preview.style.left = `${containerRect.left - 210}px`;
  const previewHeight = 190 * 7 / 5;
  let top = anchorRect.top + (anchorRect.height / 2) - (previewHeight / 2);
  top = Math.max(10, Math.min(top, window.innerHeight - previewHeight - 10));
  preview.style.top = `${top}px`;

  preview.classList.add('visible');
}

function hideStackHoverPreview() {
  if (stackPreviewEl) stackPreviewEl.classList.remove('visible');
}

export function renderStack() {
  const container = document.getElementById('stack-container');
  const list = document.getElementById('stack-list');
  const countSpan = document.getElementById('stack-count');
  const btnResolve = document.getElementById('btn-resolve-top');

  if (!container || !list) return;

  if (spellStack.length === 0) {
    container.classList.add('hidden');
    hideStackHoverPreview();
    return;
  }

  container.classList.remove('hidden');
  countSpan.textContent = spellStack.length;
  list.innerHTML = '';

  const pendingEffect = state.pendingTargetCard?.effect?.type;
  
  spellStack.forEach((item, index) => {
    const isTop = index === spellStack.length - 1;
    const cardDiv = document.createElement('div');

    const isCreatureSpell = item.type === 'summon' || item.card?.power !== undefined;
    const isCounterNonCreature = pendingEffect === 'counter_non_creature' && !isCreatureSpell;
    const isCounterCreature = pendingEffect === 'counter_creature' && isCreatureSpell;
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
      } else if (item.targetObj.type === 'permanent') {
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

    // Vista previa completa de la carta al pasar el mouse — así un jugador que no
    // conoce todas las cartas de memoria puede ver qué hace antes de decidir si
    // contrarrestarla o dejarla pasar.
    cardDiv.addEventListener('mouseenter', () => showStackHoverPreview(item, cardDiv));
    cardDiv.addEventListener('mouseleave', hideStackHoverPreview);

    list.appendChild(cardDiv);
  });

  if (btnResolve) {
    btnResolve.textContent = "Pasar Prioridad / Resolver ➔";
    btnResolve.onclick = () => {
      if (state.pendingSpellIndex !== null) {
        cancelPayment();
      }
      passPriority('local');
    };
  }
}
