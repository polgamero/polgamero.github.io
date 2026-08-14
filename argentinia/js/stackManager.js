import { sleep } from './utils.js';
import { state, resolveEffectDirect, attachAura, cancelPayment, detachEquipmentFrom, sendAurasToGraveyard, triggerCreatureEtb, triggerCreatureDies, triggerAnyCreatureDeath, getEffectivePower, getEffectiveToughness, performSacrifice, addCounters, cleanupIfVehicle, tryAutoPayCounterTax, checkPlaneswalkerDeaths, isHiddenRivalZone, getRivalName, requestRivalDecision, resolveForcedDiscardOnRival } from './main.js';
import { otherRole } from './matchSync.js';
import { logMsg, render, createCardElement, showRampLandChoiceModal } from './ui.js';
import { checkDeaths } from './combatRules.js';
import { hasKeyword, getProtectionMatch } from './keywords.js';

const COLOR_LABELS = { W: 'Blanco', U: 'Azul', B: 'Negro', R: 'Rojo', G: 'Verde' };
import { passPriority } from './turnManager.js';

// A qué le puede apuntar cada variante de "contrarrestar" — regla real de MTG (702.61 y
// glosario de counterspells): un counterspell normal SOLO frena HECHIZOS en la pila, nunca
// habilidades activadas ni disparadas, a menos que la carta lo diga explícitamente (como
// Stifle/Tale's End, que hacen lo contrario — solo habilidades — o Disallow, que hace las
// dos cosas). Antes esto no se chequeaba en ningún lado: cualquier counter servía contra
// cualquier cosa en la pila, hechizo o habilidad, indistinto.
export function getCounterTargetRestriction(effectType) {
  if (effectType === 'counter_ability') return { allowSpell: false, allowAbility: true };
  if (effectType === 'counter_any') return { allowSpell: true, allowAbility: true };
  // counter, counter_creature, counter_non_creature, counter_unless_pay: solo hechizos.
  return { allowSpell: true, allowAbility: false };
}

// Sustituye el valor de X en un efecto, en TODOS los campos donde podría aparecer como
// texto literal "X" — no solo `amount` (daño/cura/robar), sino también `powerMod`/
// `toughnessMod` (un bufo con X, ej. "+X/+X hasta el final del turno"). Antes solo se
// chequeaba `amount`, así que un pump con X nunca se resolvía bien.
function resolveXInEffect(effect, xValue) {
  if (!effect) return effect;
  const resolved = { ...effect };
  ['amount', 'powerMod', 'toughnessMod', 'lifeLoss'].forEach(key => {
    if (resolved[key] === 'X') resolved[key] = xValue;
  });
  return resolved;
}

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

  // Kicker: si se pagó el costo opcional al lanzar el hechizo, el bonus se aplica ACÁ,
  // después de que el efecto base ya resolvió — así funciona para CUALQUIER tipo de
  // hechizo sin tener que tocar cada rama de executeStackItem una por una. El bonus de
  // Kicker en este juego está limitado a efectos SIN target propio (daño a la cara, robar,
  // curarse, drenar, etc. — el mismo vocabulario que ya entiende resolveEffectDirect), para
  // no necesitar una segunda selección de objetivo además de la del efecto base.
  if (item.kicked && item.card.kicker && item.card.kicker.bonusEffect) {
    logMsg(`💪 ¡${item.card.name} fue Kickeado! Se suma el bonus.`);
    resolveEffectDirect(item.card.kicker.bonusEffect, item.card.name, item.isLocal);
  }

  // Si quedó pausado esperando que alguien decida pagar "contrarresta a menos que...", no
  // terminamos de resolver todavía — la prioridad NO se resetea hasta que se decida
  // (payCounterTax / declineCounterTax hacen eso ellos mismos al terminar).
  if (state.pendingCounterUnlessPay) return;

  // BUG ENCONTRADO Y ARREGLADO: Scry/Surveil abría el modal para elegir qué hacer con las
  // cartas, pero nunca pausaba el resto del juego — la prioridad se reseteaba igual y el
  // Tano podía tomar otra acción mientras el humano todavía estaba decidiendo, chocando
  // contra un estado a medio terminar y rompiendo el juego. Mismo criterio que el pago de
  // Ward/CounterTax: no seguimos hasta que se resuelva (finishScrySurveil en main.js hace
  // el reseteo de prioridad ella misma al terminar).
  if (state.pendingScrySurveilChoice) return;

  // Mismo criterio: Proliferar abre su propio modal (elegir permanentes) y no puede seguir
  // de largo hasta que se confirme — finishProliferate en main.js resetea la prioridad ella
  // misma al terminar.
  if (state.pendingProliferateChoice) return;

  // Tras resolver un objeto, la prioridad vuelve al jugador activo
  state.priorityPlayer = state.activePlayer;
  state.consecutivePasses = 0;

  renderStack();
  
  if (typeof render === 'function') {
    render();
  }
}

// Aplica UN efecto a UN target puntual (criatura o jugador) — extraído para reusarlo en
// objetivos múltiples, donde cada target de la carta tiene su propio efecto. Replica
// exactamente los mismos pasos que ya usa la resolución de un target único (girar
// Indestructible, sacar Equipos/Auras, avisar Vehículos) para no tener dos reglas
// distintas para lo mismo.
function applyEffectToSingleTarget(effect, targetObj, isLocal, cardName, sourceColors) {
  if (targetObj.type === 'player') {
    const isTargetLocal = targetObj.isLocal;
    const targetName = isTargetLocal ? "vos" : getRivalName();
    if (effect.type === 'damage') {
      if (isTargetLocal) state.localHP -= effect.amount; else state.rivalHP -= effect.amount;
      logMsg(`💥 ¡${cardName}! Le hizo ${effect.amount} de daño a ${targetName}.`);
    } else if (effect.type === 'heal') {
      if (isTargetLocal) state.localHP += effect.amount; else state.rivalHP += effect.amount;
      logMsg(`💚 ¡${cardName}! ${targetName} ganó ${effect.amount} de vida.`);
    } else if (effect.type === 'discard') {
      // BUGFIX (post-lanzamiento): antes esto solo evitaba el crash (el `if (discarded)`
      // de abajo), pero igual mentía en el mensaje ("descartó N carta(s)" sin haber
      // descartado nada real) o de plano se saltaba entero. Ahora le pide al cliente REAL
      // del rival que aplique el descarte sobre su mano de verdad (ver
      // resolveForcedDiscardOnRival, main.js) — sin await a propósito, ver el comentario
      // largo en la rama gemela de main.js (resolveEffectDirect) para el porqué completo.
      if (isHiddenRivalZone(isTargetLocal)) {
        resolveForcedDiscardOnRival(effect.amount || 1, cardName).then(discardedNames => {
          logMsg(discardedNames.length > 0
            ? `🗑️ ¡${cardName}! ${targetName} descartó: ${discardedNames.join(', ')}.`
            : `🗑️ ¡${cardName}! ${targetName} no tenía cartas para descartar.`);
          render();
        });
      } else {
        const hand = isTargetLocal ? state.localHand : state.rivalHand;
        const grave = isTargetLocal ? state.localGraveyard : state.rivalGraveyard;
        const amount = Math.min(effect.amount || 1, hand.length);
        for (let i = 0; i < amount; i++) {
          const idx = isTargetLocal ? hand.length - 1 : Math.floor(Math.random() * hand.length);
          const discarded = hand.splice(idx, 1)[0];
          if (discarded) grave.push(discarded);
        }
        logMsg(`🗑️ ¡${cardName}! ${targetName} descartó ${amount} carta(s).`);
      }
    } else if (effect.type === 'draw') {
      const hand = isTargetLocal ? state.localHand : state.rivalHand;
      const deck = isTargetLocal ? state.localDeck : state.rivalDeck;
      const amount = Math.min(effect.amount || 1, deck.length);
      for (let i = 0; i < amount; i++) hand.push(deck.pop());
      logMsg(`🃏 ¡${cardName}! ${targetName} robó ${amount} carta(s).`);
    }
    return;
  }

  if (targetObj.type === 'creature') {
    const targetUnit = targetObj.item;
    const isTargetLocal = state.localCombat.includes(targetUnit);
    const board = isTargetLocal ? state.localCombat : state.rivalCombat;
    const grave = isTargetLocal ? state.localGraveyard : state.rivalGraveyard;

    const protectedColor = getProtectionMatch(targetUnit, sourceColors || []);
    if (protectedColor) {
      logMsg(`🛡️ ¡${targetUnit.card.name} tiene Protección de ${COLOR_LABELS[protectedColor] || protectedColor}! ${cardName} no le hace nada.`);
      return;
    }

    if (effect.type === 'damage') {
      targetUnit.damageTaken = (targetUnit.damageTaken || 0) + effect.amount;
      logMsg(`💥 ¡${cardName}! Le hizo ${effect.amount} de daño a ${targetUnit.card.name}.`);
      checkDeaths(state.localCombat, state.localGraveyard, "Vos");
      checkDeaths(state.rivalCombat, state.rivalGraveyard, getRivalName());
    } else if (effect.type === 'pump') {
      if (!targetUnit.tempEffects) targetUnit.tempEffects = [];
      targetUnit.tempEffects.push({ powerMod: effect.powerMod || 0, toughnessMod: effect.toughnessMod || 0 });
      logMsg(`💪 ¡${cardName}! ${targetUnit.card.name} obtuvo +${effect.powerMod || 0}/+${effect.toughnessMod || 0} hasta el final del turno.`);
    } else if (effect.type === 'destroy_creature' || effect.type === 'exile_creature' || effect.type === 'bounce') {
      const idx = board.indexOf(targetUnit);
      if (idx === -1) { logMsg(`⚠️ ${cardName} falló: el objetivo ya no está en el campo.`); return; }
      if (effect.type === 'destroy_creature' && hasKeyword(targetUnit, 'indestructible')) {
        logMsg(`🛡️ ${targetUnit.card.name} es Indestructible: ${cardName} no pudo hacer nada.`);
        return;
      }
      board.splice(idx, 1);
      detachEquipmentFrom(targetUnit, isTargetLocal);
      sendAurasToGraveyard(targetUnit, isTargetLocal);
      cleanupIfVehicle(targetUnit);
      if (effect.type === 'destroy_creature') {
        grave.push(targetUnit.card);
        logMsg(`💀 ¡${cardName} destruyó a ${targetUnit.card.name}!`);
        triggerCreatureDies(targetUnit, isTargetLocal);
        triggerAnyCreatureDeath(targetUnit, isTargetLocal);
      } else if (effect.type === 'exile_creature') {
        (isTargetLocal ? state.localExile : state.rivalExile).push(targetUnit.card);
        logMsg(`🌀 ¡${cardName} exilió a ${targetUnit.card.name}!`);
      } else {
        (isTargetLocal ? state.localHand : state.rivalHand).push(targetUnit.card);
        logMsg(`🔄 ¡${cardName} devolvió a ${targetUnit.card.name} a la mano de su dueño!`);
      }
    }
    return;
  }

  if (targetObj.type === 'permanent') {
    const permItem = targetObj.item;
    const isTargetLocal = state.localSupport.includes(permItem);
    const zone = isTargetLocal ? state.localSupport : state.rivalSupport;
    const grave = isTargetLocal ? state.localGraveyard : state.rivalGraveyard;
    const idx = zone.indexOf(permItem);
    if (idx === -1) { logMsg(`⚠️ ${cardName} falló: el objetivo ya no está en el campo.`); return; }
    if ((effect.type === 'destroy_artifact' && permItem.card.type.includes('Artefacto')) ||
        (effect.type === 'destroy_enchantment' && permItem.card.type.includes('Encantamiento'))) {
      zone.splice(idx, 1);
      grave.push(permItem.card);
      logMsg(`💥 ¡${cardName} destruyó ${permItem.card.name}!`);
    }
    return;
  }

  // LÓGICA NUEVA (Cabo suelto #13): mismo caso que en la resolución de target único, para
  // cuando un Planeswalker es UNO de los varios targets de un hechizo multi-target.
  if (targetObj.type === 'planeswalker') {
    const pwItem = targetObj.item;
    const isTargetLocal = state.localPlaneswalkers.includes(pwItem);
    const zone = isTargetLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers;
    if (!zone.includes(pwItem)) { logMsg(`⚠️ ${cardName} falló: el objetivo ya no está en el campo.`); return; }
    if (effect.type === 'damage') {
      pwItem.loyalty -= effect.amount;
      logMsg(`💥 ¡${cardName}! Le sacó ${effect.amount} de Lealtad a ${pwItem.card.name} (queda en ${pwItem.loyalty}).`);
      checkPlaneswalkerDeaths();
    }
  }
}

async function executeStackItem(item) {
  const { card, isLocal, targetObj, type } = item;

  // Mandar la carta que se está resolviendo a donde corresponda (cementerio normal, o
  // Exilio si vino por Flashback) — se llama en cada lugar donde el hechizo termina de
  // resolverse ANTES de llegar al final natural de la función (contrarrestar algo mal
  // targeteado, pagar/no pagar un "contrarresta a menos que", etc.), para que la carta
  // nunca desaparezca del juego sin ir a ningún lado.
  const sendResolvedCardAway = () => {
    if (item.castFrom === 'flashback') {
      (isLocal ? state.localExile : state.rivalExile).push(card);
      logMsg(`🌀 ${card.name} se exilía tras resolverse (Flashback ya usado).`);
    } else {
      (isLocal ? state.localGraveyard : state.rivalGraveyard).push(card);
    }
  };

  if (type === 'planeswalker') {
    const pwZone = isLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers;
    const newPw = { card, loyalty: card.loyalty, abilityUsedThisTurn: false };
    pwZone.push(newPw);
    logMsg(`🔮 ¡${card.name} entró al campo de batalla con ${card.loyalty} de Lealtad!`);
    return;
  }

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
        checkDeaths(state.rivalCombat, state.rivalGraveyard, getRivalName());
      }
    }

    if (card.etbEffect) {
      if (card.requiresTarget && targetObj) {
        let effectToApply = card.etbEffect;
        // Costo de maná variable ({X}): si el efecto usa "X" como cantidad, lo resolvemos
        // acá al valor real que el jugador fijó al lanzar el hechizo (nunca antes de esto).
        if (effectToApply) {
          effectToApply = resolveXInEffect(effectToApply, item.xValue || 0);
        }
        if (targetObj.type === 'player') {
          const targetName = targetObj.isLocal ? "vos" : getRivalName();
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
            const protectedColor = getProtectionMatch(targetUnit, card.colors || []);
            if (protectedColor) {
              logMsg(`🛡️ ¡${targetUnit.card.name} tiene Protección de ${COLOR_LABELS[protectedColor] || protectedColor}! El daño de ${card.name} fue prevenido.`);
            } else {
              targetUnit.damageTaken += effectToApply.amount;
              logMsg(`💥 ¡${card.name}! Le hizo ${effectToApply.amount} de daño a ${targetUnit.card.name}.`);
              checkDeaths(state.localCombat, state.localGraveyard, "Vos");
              checkDeaths(state.rivalCombat, state.rivalGraveyard, getRivalName());
            }
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
    checkDeaths(state.rivalCombat, state.rivalGraveyard, getRivalName());
    return;
  }

  // Objetivos múltiples: cada entrada de card.targets[] tiene su propio efecto, ya
  // emparejado en orden con targetObj.targets[] (el jugador/el Tano los eligió uno por
  // uno, en ese mismo orden, al castear el hechizo).
  if (targetObj && targetObj.type === 'multi') {
    (card.targets || []).forEach((spec, i) => {
      const chosen = targetObj.targets[i];
      if (!chosen) return;
      let effectToApply = spec.effect;
      if (effectToApply) {
        effectToApply = resolveXInEffect(effectToApply, item.xValue || 0);
      }
      applyEffectToSingleTarget(effectToApply, chosen, isLocal, card.name, card.colors);
    });
    // BUG encontrado y arreglado: esto hacía return sin mandar la carta a ningún lado —
    // un hechizo multi-target resuelto desaparecía del juego entero, ni cementerio ni
    // Exilio. Mismo criterio de Flashback que el resto de los hechizos.
    if (item.castFrom === 'flashback') {
      (isLocal ? state.localExile : state.rivalExile).push(card);
      logMsg(`🌀 ${card.name} se exilía tras resolverse (Flashback ya usado).`);
    } else if (isLocal) {
      state.localGraveyard.push(card);
    } else {
      state.rivalGraveyard.push(card);
    }
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

    // Costo de maná variable ({X}): si el efecto usa "X" como cantidad, lo resolvemos acá
    // al valor real que el jugador (o el Tano) fijó al lanzar el hechizo — nunca antes.
    if (effectToApply) {
      effectToApply = resolveXInEffect(effectToApply, item.xValue || 0);
    }

    if (effectToApply && effectToApply.type && effectToApply.type.startsWith('counter')) {
      if (targetObj && targetObj.type === 'stack') {
        const targetIndex = spellStack.findIndex(s => s.id === targetObj.stackId);
        if (targetIndex !== -1) {
          const targetItem = spellStack[targetIndex];

          // Red de seguridad (además de lo que ya valida handleStackCardClick del lado
          // humano): un counter normal no puede frenar una habilidad, y uno tipo Stifle no
          // puede frenar un hechizo. Cubre sobre todo al Tano, que no pasa por esa validación.
          const targetIsAbility = targetItem.type === 'ability';
          const restriction = getCounterTargetRestriction(effectToApply.type);
          const typeAllowed = targetIsAbility ? restriction.allowAbility : restriction.allowSpell;
          if (!typeAllowed) {
            logMsg(`⚠️ ${card.name} no puede contrarrestar a "${targetItem.card.name}" — ${targetIsAbility ? 'es una habilidad, no un hechizo' : 'es un hechizo, no una habilidad'}.`);
            sendResolvedCardAway();
            return;
          }

          // "Contrarresta a menos que pague": el CONTROLADOR del hechizo amenazado decide,
          // no quien tira el counterspell. Si es tuyo, pausamos y te dejamos elegir. Si es
          // del rival: en Solitario, el Tano decide solo (paga si puede, sin UI — no hay
          // nadie del otro lado a quien preguntarle). En MULTIPLAYER, la decisión es de
          // VERDAD del rival — se la preguntamos por sync, en SU propia pantalla, en vez de
          // decidir nosotros mismos por él (ver requestRivalDecision, main.js — mecanismo
          // GENERAL, reusable para cualquier otra decisión futura del rival).
          if (effectToApply.type === 'counter_unless_pay') {
            const amount = effectToApply.amount;
            if (targetItem.isLocal) {
              // Guardamos también el propio counterspell (card/isLocal/castFrom) para que
              // payCounterTax/declineCounterTax lo puedan mandar a destino cuando
              // terminen de resolver esto — si no, se perdía sin ir a ningún lado.
              state.pendingCounterUnlessPay = { targetStackId: targetObj.stackId, amount, targetCardName: targetItem.card.name, counterCard: card, counterIsLocal: isLocal, counterCastFrom: item.castFrom };
              logMsg(`💰 ¡${card.name} amenaza con contrarrestar "${targetItem.card.name}"! Pagá {${amount}} o se pierde.`);
              return;
            } else if (state.currentMatch) {
              const rivalRole = otherRole(state.currentMatch.myRole);
              const response = await requestRivalDecision('counter_unless_pay', rivalRole, { amount, targetCardName: targetItem.card.name });
              if (response.paid) {
                logMsg(`💰 ${getRivalName()} pagó {${amount}} para que "${targetItem.card.name}" no se pierda.`);
                sendResolvedCardAway();
                return;
              }
              logMsg(`🚫 ${getRivalName()} no pagó {${amount}} — "${targetItem.card.name}" se pierde.`);
              // sigue de largo: se contrarresta de verdad, como cualquier counter normal
            } else {
              const paid = tryAutoPayCounterTax(false, amount);
              if (paid) {
                logMsg(`💰 ${getRivalName()} pagó {${amount}} para que "${targetItem.card.name}" no se pierda.`);
                sendResolvedCardAway();
                return;
              }
              logMsg(`🚫 ${getRivalName()} no pudo pagar {${amount}} — "${targetItem.card.name}" se pierde.`);
              // sigue de largo: se contrarresta de verdad, como cualquier counter normal
            }
          }

          const counteredItem = spellStack.splice(targetIndex, 1)[0];
          logMsg(`🚫 ¡${card.name} contrarrestó a "${counteredItem.card.name}"!`);
          if (counteredItem.isLocal) state.localGraveyard.push(counteredItem.card);
          else state.rivalGraveyard.push(counteredItem.card);
          
          if (card.secondaryEffect && card.secondaryEffect.type === 'add_counter') {
            const friendlyBoard = isLocal ? state.localCombat : state.rivalCombat;
            if (friendlyBoard.length > 0) {
              // Simplificación consciente: "hasta una criatura objetivo que controlás" pediría
              // una segunda selección de objetivo, independiente de a quién le contrarrestás el
              // hechizo — elegimos automáticamente tu criatura más fuerte en vez de sumar esa UI.
              const buffTarget = friendlyBoard.reduce((best, cur) =>
                getEffectivePower(cur) + getEffectiveToughness(cur) > getEffectivePower(best) + getEffectiveToughness(best) ? cur : best
              );
              addCounters(buffTarget, 'plusOne', card.secondaryEffect.amount || 1);
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
        const targetName = targetObj.isLocal ? "vos" : getRivalName();
        if (effectToApply.type === 'damage') {
          if (targetObj.isLocal) state.localHP -= effectToApply.amount; 
          else state.rivalHP -= effectToApply.amount;
          logMsg(`💥 ¡${card.name}! Le hizo ${effectToApply.amount} de daño a ${targetName}.`);
        } else if (effectToApply.type === 'heal') {
          if (targetObj.isLocal) state.localHP += effectToApply.amount; 
          else state.rivalHP += effectToApply.amount;
          logMsg(`💚 ¡${card.name}! Curó ${effectToApply.amount} de HP a ${targetName}.`);
        }
        // LÓGICA NUEVA: VENENO DIRECTO (sin pasar por combate/Infectar) — solo existe para
        // jugadores, nunca para criaturas (regla real: los contadores de Veneno son de
        // jugador, distinto de los -1/-1 que sí van en criaturas).
        else if (effectToApply.type === 'poison') {
          if (targetObj.isLocal) state.localPoison = (state.localPoison || 0) + effectToApply.amount;
          else state.rivalPoison = (state.rivalPoison || 0) + effectToApply.amount;
          // BUGFIX: antes comparaba targetName === 'el Tano' (string fija) para decidir si
          // agregar "al Tano" al final — con un nombre real de rival, esa comparación
          // nunca daba true. Ahora usa targetObj.isLocal directo, sin depender del string.
          logMsg(`☠️ ¡${card.name}! ${targetObj.isLocal ? 'Te' : 'Le'} puso ${effectToApply.amount} contador(es) de Veneno${targetObj.isLocal ? '' : ` a ${targetName}`}.`);
        }
        // LÓGICA NUEVA: DESCARTE
        else if (effectToApply.type === 'discard') {
          // BUGFIX (post-lanzamiento): antes esto se saltaba entero contra la mano oculta
          // del rival en multiplayer. Ahora le pide a SU cliente real que aplique el
          // descarte sobre su mano de verdad (resolveForcedDiscardOnRival, main.js). Acá SÍ
          // se puede usar un await de verdad — a diferencia de las otras 2 ramas gemelas de
          // esto (main.js y applyEffectToSingleTarget), esta vive dentro de
          // executeStackItem, que ya es async y ya se espera correctamente desde
          // resolveTopStackItem — no hace falta el patrón de "disparar y no esperar".
          if (isHiddenRivalZone(targetObj.isLocal)) {
            const discardedNames = await resolveForcedDiscardOnRival(effectToApply.amount, card.name);
            logMsg(discardedNames.length > 0
              ? `🗑️ ¡${card.name}! ${targetName} descartó: ${discardedNames.join(', ')}.`
              : `🗑️ ¡${card.name}! ${targetName} no tenía cartas para descartar.`);
          } else {
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
        }
        // LÓGICA NUEVA: EXILIAR CEMENTERIO ENTERO (odio de cementerio)
        else if (effectToApply.type === 'exile_graveyard') {
          const targetGraveyard = targetObj.isLocal ? state.localGraveyard : state.rivalGraveyard;
          const targetExile = targetObj.isLocal ? state.localExile : state.rivalExile;
          const count = targetGraveyard.length;
          if (count > 0) {
            targetExile.push(...targetGraveyard);
            targetGraveyard.length = 0;
            logMsg(`🌀 ¡${card.name} exilió las ${count} carta(s) del cementerio de ${targetName}!`);
          } else {
            logMsg(`${card.name}: el cementerio de ${targetName} ya estaba vacío.`);
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
          const protectedColor = getProtectionMatch(targetUnit, card.colors || []);
          if (protectedColor) {
            logMsg(`🛡️ ¡${targetUnit.card.name} tiene Protección de ${COLOR_LABELS[protectedColor] || protectedColor}! El daño de ${card.name} fue prevenido.`);
          } else {
            targetUnit.damageTaken += effectToApply.amount;
            logMsg(`💥 ¡${card.name}! Le hizo ${effectToApply.amount} de daño a ${targetUnit.card.name}.`);
            checkDeaths(state.localCombat, state.localGraveyard, "Vos");
            checkDeaths(state.rivalCombat, state.rivalGraveyard, getRivalName());
          }
        } 
        // LÓGICA NUEVA: EQUIPAR (real) — el Equipo que activó esta habilidad se adjunta a la criatura.
        // No se copia a `auras`: el Equipo sigue siendo su propio permanente en la zona de soporte,
        // simplemente ahora apunta con `attachedTo` a la criatura equipada.
        else if (effectToApply.type === 'attach_equipment') {
          const equipmentItem = item.sourceItem;
          const protectedColor = getProtectionMatch(targetUnit, card.colors || []);
          if (protectedColor) {
            logMsg(`🛡️ ¡${targetUnit.card.name} tiene Protección de ${COLOR_LABELS[protectedColor] || protectedColor}! No se le puede equipar ${card.name}.`);
          } else if (equipmentItem) {
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
          // Prioridad: la criatura que el jugador ELIGIÓ manualmente (targetObj.fightWithItem,
          // ver el paso 2 de selección en handleCombatClick) > la fuente de una habilidad
          // propia (ej. Alberto Samid, donde "quién pelea" ya está claro de antemano) > el
          // viejo fallback de auto-elegir tu criatura más fuerte, por si algo llega sin
          // ninguna de las dos anteriores.
          let selfUnit = targetObj.fightWithItem || item.sourceItem;
          if (!selfUnit) {
            const ownBoard = isLocal ? state.localCombat : state.rivalCombat;
            if (ownBoard.length > 0) {
              selfUnit = ownBoard.reduce((prev, current) => getEffectivePower(prev) > getEffectivePower(current) ? prev : current);
            }
          }
          if (selfUnit) {
            // Pelear (fight) NO es daño de combate — son reglas propias (regla 701.12 y
            // el comprehensive rules glossary de "fight"). Repasado contra las reglas
            // oficiales: Primer Golpe, Doble Golpe y Arrollar NO participan (el daño
            // siempre es simultáneo, una sola vez, y nunca hay jugador de por medio) — por
            // eso ninguno de los dos se chequea acá abajo. Toque Mortal, Vínculo Vital,
            // Indestructible y Protección SÍ participan igual que en combate normal.
            const selfPower = getEffectivePower(selfUnit);
            const targetPower = getEffectivePower(targetUnit);
            const selfHasDeathtouch = hasKeyword(selfUnit, 'deathtouch');
            const targetHasDeathtouch = hasKeyword(targetUnit, 'deathtouch');
            const selfHasLifelink = hasKeyword(selfUnit, 'lifelink');
            const targetHasLifelink = hasKeyword(targetUnit, 'lifelink');

            // Protección corre en las dos direcciones: cada uno puede estar a salvo del
            // color del otro sin que eso frene la pelea en sí, solo el daño de ese lado.
            const targetProtectedFromSelf = getProtectionMatch(targetUnit, selfUnit.card.colors || []);
            const selfProtectedFromTarget = getProtectionMatch(selfUnit, targetUnit.card.colors || []);

            if (targetProtectedFromSelf) {
              logMsg(`🛡️ ¡${targetUnit.card.name} tiene Protección de ${COLOR_LABELS[targetProtectedFromSelf] || targetProtectedFromSelf}! No recibe daño de ${selfUnit.card.name}.`);
            } else if (selfPower > 0) {
              targetUnit.damageTaken = (targetUnit.damageTaken || 0) + selfPower;
              if (selfHasDeathtouch) targetUnit.tookDeathtouch = true;
              if (selfHasLifelink) {
                if (isLocal) state.localHP += selfPower; else state.rivalHP += selfPower;
                logMsg(`💚 Vínculo Vital: ${selfUnit.card.name} le da ${selfPower} de vida a su controlador.`);
              }
            }

            if (selfProtectedFromTarget) {
              logMsg(`🛡️ ¡${selfUnit.card.name} tiene Protección de ${COLOR_LABELS[selfProtectedFromTarget] || selfProtectedFromTarget}! No recibe daño de ${targetUnit.card.name}.`);
            } else if (targetPower > 0) {
              selfUnit.damageTaken = (selfUnit.damageTaken || 0) + targetPower;
              if (targetHasDeathtouch) selfUnit.tookDeathtouch = true;
              if (targetHasLifelink) {
                if (isLocal) state.rivalHP += targetPower; else state.localHP += targetPower;
                logMsg(`💚 Vínculo Vital: ${targetUnit.card.name} le da ${targetPower} de vida a su controlador.`);
              }
            }

            logMsg(`🥊 ¡${selfUnit.card.name} pelea contra ${targetUnit.card.name}! (${selfPower} vs ${targetPower} de daño)`);
            checkDeaths(state.localCombat, state.localGraveyard, "Vos");
            checkDeaths(state.rivalCombat, state.rivalGraveyard, getRivalName());
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
        // LÓGICA NUEVA: CONTADOR PERMANENTE +1/+1 o -1/-1 — a diferencia de "pump" (temporal,
        // se borra en Limpieza), esto usa el mismo sistema real de contadores que ya tienen
        // los Planeswalkers (addCounters), así que se queda mientras la criatura viva Y
        // Proliferar lo puede multiplicar más adelante.
        else if (effectToApply.type === 'add_counter') {
          const counterType = effectToApply.counterType === 'minusOne' ? 'minusOne' : 'plusOne';
          const amount = effectToApply.amount || 1;
          addCounters(targetUnit, counterType, amount);
          const signo = counterType === 'plusOne' ? '+' : '-';
          logMsg(`🔵 ¡${card.name}! ${targetUnit.card.name} recibió ${amount} contador(es) ${signo}${amount}/${signo}${amount}.`);
          checkDeaths(state.localCombat, state.localGraveyard, "Vos");
          checkDeaths(state.rivalCombat, state.rivalGraveyard, getRivalName());
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
              cleanupIfVehicle(targetUnit); // si era un Vehículo tripulado, saca el power/toughness "prestado"
              grave.push(targetUnit.card);
              logMsg(`💀 ¡${card.name} destruyó a ${targetUnit.card.name}!`);
              triggerCreatureDies(targetUnit, isTargetLocal);
              triggerAnyCreatureDeath(targetUnit, isTargetLocal);
            }
          } else {
            logMsg(`⚠️ ${card.name} falló: el objetivo ya no está en el campo.`);
          }
        }
        // LÓGICA NUEVA: EXILIAR CRIATURA — a diferencia de destruir, el Exilio NO es
        // "destrucción" en las reglas reales: Indestructible NO lo frena. Tampoco cuenta
        // como que la criatura "murió" (morir = ir al cementerio desde el campo), así que
        // NO dispara triggerCreatureDies ni triggerAnyCreatureDeath ("cuando muera una
        // criatura..."). Y como no pasa por el cementerio, cartas como Reanimar no la
        // pueden traer de vuelta — es la diferencia clave que hace valioso al Exilio.
        // LÓGICA NUEVA: PARPADEO TEMPORAL — exilia y programa el regreso para el próximo
        // Paso Final DEL CONTROLADOR (no necesariamente el que viene ahora mismo: si se
        // tira en el turno rival, vuelve recién en tu próximo turno). Al volver entra como
        // un objeto totalmente nuevo — sin auras, sin equipos, sin contadores, con mareo de
        // invocación fresco — tal cual la regla real de MTG. Como pasa por el Exilio,
        // Indestructible tampoco frena esto.
        else if (effectToApply.type === 'exile_and_return') {
          const isTargetLocal = state.localCombat.includes(targetUnit);
          const board = isTargetLocal ? state.localCombat : state.rivalCombat;
          const exileZone = isTargetLocal ? state.localExile : state.rivalExile;
          const idx = board.indexOf(targetUnit);
          if (idx !== -1) {
            board.splice(idx, 1);
            detachEquipmentFrom(targetUnit, isTargetLocal);
            sendAurasToGraveyard(targetUnit, isTargetLocal);
            cleanupIfVehicle(targetUnit);
            exileZone.push(targetUnit.card);
            state.scheduledReturns.push({ card: targetUnit.card, isLocal: isTargetLocal });
            logMsg(`🌀 ¡${card.name} exilió a ${targetUnit.card.name}! Vuelve al campo en el próximo Paso Final de su controlador.`);
          } else {
            logMsg(`⚠️ ${card.name} falló: el objetivo ya no está en el campo.`);
          }
        }
        else if (effectToApply.type === 'exile_creature') {
          const isTargetLocal = state.localCombat.includes(targetUnit);
          const board = isTargetLocal ? state.localCombat : state.rivalCombat;
          const exileZone = isTargetLocal ? state.localExile : state.rivalExile;
          const idx = board.indexOf(targetUnit);
          if (idx !== -1) {
            board.splice(idx, 1);
            detachEquipmentFrom(targetUnit, isTargetLocal);
            sendAurasToGraveyard(targetUnit, isTargetLocal);
            cleanupIfVehicle(targetUnit);
            exileZone.push(targetUnit.card);
            logMsg(`🌀 ¡${card.name} exilió a ${targetUnit.card.name}! No va a poder volver del cementerio.`);
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
            cleanupIfVehicle(targetUnit); // si era un Vehículo tripulado, saca el power/toughness "prestado"
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
            checkDeaths(state.rivalCombat, state.rivalGraveyard, getRivalName());
          }
        } else if (idx === -1) {
          logMsg(`⚠️ ${card.name} falló: el objetivo ya no está en el campo.`);
        }
      }
      // LÓGICA NUEVA (Cabo suelto #13): DAÑO A UN PLANESWALKER — un hechizo de daño a
      // "cualquier objetivo" ahora también puede apuntarle a uno (regla real moderna). Le
      // resta Lealtad en vez de HP; el resto de los tipos de efecto no tiene sentido acá
      // (curar/robar/etc. son cosas de jugador, no de Planeswalker) así que no se listan.
      else if (targetObj.type === 'planeswalker') {
        const pwItem = targetObj.item;
        const isTargetLocal = state.localPlaneswalkers.includes(pwItem);
        const zone = isTargetLocal ? state.localPlaneswalkers : state.rivalPlaneswalkers;
        if (!zone.includes(pwItem)) {
          logMsg(`⚠️ ${card.name} falló: el objetivo ya no está en el campo.`);
        } else if (effectToApply.type === 'damage') {
          pwItem.loyalty -= effectToApply.amount;
          logMsg(`💥 ¡${card.name}! Le sacó ${effectToApply.amount} de Lealtad a ${pwItem.card.name} (queda en ${pwItem.loyalty}).`);
          checkPlaneswalkerDeaths();
        }
      }
    } else {
      // LÓGICA: TIERRAS-CRIATURA (man-lands). OJO: esto ya NO lo usan los Vehículos de
      // verdad (Carreta Blindada, Rolls Royce, Caballo de San Martín) — esos ahora se
      // tripulan girando poder de criaturas propias (ver startCrewing/confirmCrew en
      // main.js, activatedAbility.crewCost), nunca con maná. Este camino sigue vivo
      // solo para las tierras-criatura (Cancha de Potrero, Refugio de Montaña), que SÍ
      // se animan pagando maná — como Mutavault en MTG real, es una mecánica distinta
      // de Tripular aunque reutilice el mismo efecto interno "se vuelve criatura".
      if (effectToApply.type === 'crew_vehicle') {
        const supportZone = isLocal ? state.localSupport : state.rivalSupport;
        const landsZone = isLocal ? state.localLands : state.rivalLands;
        const combatZone = isLocal ? state.localCombat : state.rivalCombat;

        // Los Vehículos normales viven en Soporte, pero una "tierra-criatura" (man-land)
        // usa este MISMO mecanismo desde la zona de Tierras — buscamos en las dos.
        let vehicleIndex = supportZone.findIndex(s => s.card.id === card.id);
        let originZone = supportZone;
        let fromLand = false;
        if (vehicleIndex === -1) {
          vehicleIndex = landsZone.findIndex(s => s.card.id === card.id);
          originZone = landsZone;
          fromLand = true;
        }
        if (vehicleIndex !== -1) {
          const vehicleItem = originZone.splice(vehicleIndex, 1)[0];
          
          // Le pasamos los stats base para que se vuelva criatura temporal
          vehicleItem.card.power = card.baseStats.power;
          vehicleItem.card.toughness = card.baseStats.toughness;
          vehicleItem.isVehicle = true; // Flag clave para devolverlo después
          vehicleItem.wasLand = fromLand; // A qué zona devolverla: Tierras o Soporte
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
            cleanupIfVehicle(unit); // si era un Vehículo tripulado, saca el power/toughness "prestado"
            graveyard.push(unit.card);
            triggerCreatureDies(unit, isLocalZone);
            triggerAnyCreatureDeath(unit, isLocalZone);
            count++;
          }
          return count;
        };
        const localCount = wipeBoard(state.localCombat, state.localGraveyard, true);
        const rivalCount = wipeBoard(state.rivalCombat, state.rivalGraveyard, false);
        logMsg(`💥 ¡${card.name} arrasó con todo! (${localCount} tuya(s) + ${rivalCount} de ${getRivalName()} fueron al cementerio)`);
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
            image: effectToApply.image,
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
        // FASE 4, ETAPA 5: si esto buscara en el mazo del RIVAL en multiplayer (no debería
        // pasar en la práctica — la rampa siempre busca en el propio mazo — pero por las
        // dudas, blindaje defensivo contra revisar propiedades de un valor vacío).
        if (isHiddenRivalZone(isLocal)) {
          logMsg(`⚠️ ${card.name}: buscar en el mazo del rival todavía no se puede resolver en multiplayer (es privado).`);
        } else {
        const deck = isLocal ? state.localDeck : state.rivalDeck;
        const landZone = isLocal ? state.localLands : state.rivalLands;
        const amount = effectToApply.amount || 1;
        let foundCount = 0;
        for (let i = 0; i < amount; i++) {
          // BUG 2 (post-lanzamiento): antes tomaba directo la PRIMERA tierra básica que
          // encontraba en el mazo (mezclado al azar, sin dejarte elegir). Ahora, si sos vos
          // (con pantalla real), te deja elegir el COLOR entre los que de verdad tenés
          // disponibles en el mazo — recién ahí buscamos una tierra de ese color puntual.
          const availableColors = [...new Set(
            deck.filter(c => c.type.includes('Tierra') && c.type.includes('básica')).map(c => c.produces)
          )];
          if (availableColors.length === 0) break;

          // El Tano (isLocal:false, sin UI real detrás) no puede "elegir" en una pantalla —
          // toma el primer color disponible, mismo comportamiento que antes tenía TODO el
          // mundo. Solo el jugador con pantalla de verdad ve el modal.
          const chosenColor = isLocal
            ? await new Promise(resolve => showRampLandChoiceModal(availableColors, card.name, resolve))
            : availableColors[0];

          const idx = deck.findIndex(c => c.type.includes('Tierra') && c.type.includes('básica') && c.produces === chosenColor);
          if (idx === -1) break; // no debería pasar (chosenColor salió de availableColors), defensivo
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
      }
      else {
        resolveEffectDirect(effectToApply, card.name, isLocal);
      }
    }
    
    if (type !== 'ability') {
      // Flashback: al resolver, se exilía en vez de volver al cementerio (regla real de
      // Flashback — "úsala una vez, después se va del todo"). Cualquier otro casteo normal
      // sigue yendo al cementerio como siempre.
      if (item.castFrom === 'flashback') {
        (isLocal ? state.localExile : state.rivalExile).push(card);
        logMsg(`🌀 ${card.name} se exilía tras resolverse (Flashback ya usado).`);
      } else if (isLocal) {
        state.localGraveyard.push(card);
      } else {
        state.rivalGraveyard.push(card);
      }
    }
  }
}

export function handleStackCardClick(item) {
  if (!state.pendingTargetCard) return;

  const effectType = state.pendingTargetCard.effect?.type;

  if (effectType && effectType.startsWith('counter')) {
    const isAbility = item.type === 'ability';
    const restriction = getCounterTargetRestriction(effectType);

    if (isAbility && !restriction.allowAbility) {
      logMsg("❌ Esta carta solo puede contrarrestar HECHIZOS — no frena habilidades activadas ni disparadas.");
      return;
    }
    if (!isAbility && !restriction.allowSpell) {
      logMsg("❌ Esta carta solo puede contrarrestar HABILIDADES activadas o disparadas — no frena hechizos.");
      return;
    }

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
    const isAbilityItem = item.type === 'ability';

    let isTargetingCounter = false;
    if (pendingEffect && pendingEffect.startsWith('counter')) {
      const restriction = getCounterTargetRestriction(pendingEffect);
      const typeAllowed = isAbilityItem ? restriction.allowAbility : restriction.allowSpell;
      if (typeAllowed) {
        if (pendingEffect === 'counter_creature') isTargetingCounter = isCreatureSpell;
        else if (pendingEffect === 'counter_non_creature') isTargetingCounter = !isCreatureSpell;
        else isTargetingCounter = true; // counter, counter_unless_pay, counter_ability, counter_any
      }
    }
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

    const ownerText = item.isLocal ? 'Vos' : getRivalName();

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
