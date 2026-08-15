import { hasKeyword, canBlock, predictDuel, getProtectionMatch } from './keywords.js';
import { moveBattlefieldCardToZone } from './utils.js';

const COLOR_LABELS = { W: 'Blanco', U: 'Azul', B: 'Negro', R: 'Rojo', G: 'Verde' };

import { 
  state, 
  logMsg, 
  getEffectivePower, 
  getEffectiveToughness, 
  render, 
  passPriority, // Importado del main/turnManager
  detachEquipmentFrom,
  sendAurasToGraveyard,
  triggerCreatureDies,
  triggerAnyCreatureDeath,
  queueCreatureDeathBatch,
  queueTriggeredAbility,
  queueTriggeredAbilities,
  cleanupIfVehicle,
  checkPlaneswalkerDeaths,
  addCounters,
  getRivalName,
  waitForDiscardEffects
} from './main.js';
import { showDamageAssignmentModal } from './ui.js';

// Habilidades disparadas de combate: ahora se APILAN en vez de resolver durante la
// declaración/daño. `triggerKey` se traduce a una etiqueta estable para Stack/logs.
export function triggerCombatAbility(unit, triggerKey, isLocal) {
  const trig = unit?.card?.[triggerKey];
  if (!trig) return null;
  const triggerType = triggerKey === 'attackTrigger' ? 'attack'
    : triggerKey === 'blockTrigger' ? 'block'
    : triggerKey === 'combatDamageTrigger' ? 'combat_damage'
    : triggerKey;
  return queueTriggeredAbility({
    effect: trig, sourceCard: unit.card, sourceItem: unit, isLocal, triggerType
  });
}

// Encantamientos/Artefactos que reaccionan a que una criatura ataque. Snapshot + batch para
// que todos los watchers del mismo evento entren juntos a la Stack.
export function triggerAnyCreatureAttacks(isLocal) {
  const support = isLocal ? state.localSupport : state.rivalSupport;
  return queueTriggeredAbilities(
    support
      .filter(s => s.card?.anyCreatureAttacksTrigger)
      .map(s => ({
        effect: s.card.anyCreatureAttacksTrigger, sourceCard: s.card, sourceItem: s, isLocal,
        triggerType: 'any_creature_attacks'
      }))
  );
}

// Los blockTrigger deben dispararse al DECLARAR/confirmar bloqueadores, no al empezar el
// daño. Marcamos cada bloqueador para que una ronda de prioridad/IA no los duplique.
export function queueDeclaredBlockTriggers(defenders, defenderIsLocal) {
  const entries = [];
  defenders.forEach(unit => {
    if (unit.blockingIndex === null || unit.blockingIndex === undefined) return;
    if (unit.blockTriggerQueuedThisCombat) return;
    unit.blockTriggerQueuedThisCombat = true;
    if (unit.card?.blockTrigger) {
      entries.push({
        effect: unit.card.blockTrigger, sourceCard: unit.card, sourceItem: unit,
        isLocal: defenderIsLocal, triggerType: 'block'
      });
    }
  });
  return queueTriggeredAbilities(entries);
}

// --- BLOQUEO INTELIGENTE DEL TANO ---
function assignSmartBlock(att, aIdx, availableBlockers) {
  const atkPower = getEffectivePower(att);
  const atkTough = getEffectiveToughness(att);
  const atkHasTrample = hasKeyword(att, 'trample');

  const legalBlockers = availableBlockers.filter(obj => canBlock(att, obj.c));
  if (legalBlockers.length === 0) return;

  const kills = (blockerItem) => predictDuel(att, blockerItem.c).attackerDies;
  const blockerSurvives = (blockerItem) => !predictDuel(att, blockerItem.c).blockerDies;
  const valueOf = (blockerItem) => getEffectivePower(blockerItem.c) + getEffectiveToughness(blockerItem.c);

  const cleanKill = legalBlockers.find(obj => kills(obj) && blockerSurvives(obj));
  if (cleanKill) {
    commitBlock(cleanKill, aIdx, availableBlockers);
    logMsg(`🛡️ El Tano bloquea a tu ${att.card.name} con ${cleanKill.c.card.name} y se lo lleva puesto sin perder nada.`);
    return;
  }

  if (!atkHasTrample) {
    const safeBlockers = legalBlockers.filter(blockerSurvives);
    if (safeBlockers.length > 0) {
      const chosen = [...safeBlockers].sort((x, y) => valueOf(x) - valueOf(y))[0];
      commitBlock(chosen, aIdx, availableBlockers);
      logMsg(`🛡️ El Tano frena a tu ${att.card.name} con ${chosen.c.card.name}: no arriesga nada, sobrevive tranquilo.`);
      return;
    }

    const tradeKill = legalBlockers.find(kills);
    if (tradeKill) {
      commitBlock(tradeKill, aIdx, availableBlockers);
      logMsg(`🛡️ El Tano bloquea a tu ${att.card.name} con ${tradeKill.c.card.name}, cambio parejo.`);
      return;
    }

    const seriousHit = atkPower >= state.rivalHP * 0.3;
    const pureDefenders = legalBlockers.filter(obj => hasKeyword(obj.c, 'defender'));

    if (seriousHit || pureDefenders.length > 0) {
      const pool = pureDefenders.length > 0 ? pureDefenders : legalBlockers;
      const chump = [...pool].sort((x, y) => valueOf(x) - valueOf(y))[0];
      commitBlock(chump, aIdx, availableBlockers);
      logMsg(`🛡️ El Tano sacrifica a ${chump.c.card.name} para frenar el golpe de tu ${att.card.name}.`);
    }
    return;
  }

  const sortedByValue = [...legalBlockers].sort((x, y) => valueOf(x) - valueOf(y));

  let gang = [];
  let sumPower = 0;
  let sumTough = 0;
  for (const obj of sortedByValue) {
    gang.push(obj);
    sumPower += getEffectivePower(obj.c);
    sumTough += getEffectiveToughness(obj.c);
    if (sumPower >= atkTough && sumTough >= atkPower) break;
  }

  const willKillAttacker = sumPower >= atkTough;
  const willAbsorbAllTrample = sumTough >= atkPower;

  if (willKillAttacker || willAbsorbAllTrample) {
    gang.forEach(obj => commitBlock(obj, aIdx, availableBlockers));
    const names = gang.map(o => o.c.card.name).join(', ');
    if (willKillAttacker && willAbsorbAllTrample) {
      logMsg(`🧠 El Tano gangea a tu ${att.card.name} con ${names}: lo mata y no pasa nada de Arrollar.`);
    } else if (willKillAttacker) {
      logMsg(`🧠 El Tano gangea a tu ${att.card.name} con ${names} para matarlo, aunque algo de Arrollar se filtre.`);
    } else {
      logMsg(`🧠 El Tano gangea a tu ${att.card.name} con ${names} para absorber todo el Arrollar, aunque no logre matarlo.`);
    }
    return;
  }

  const seriousHit = atkPower >= state.rivalHP * 0.3;
  const pureDefenders = sortedByValue.filter(obj => hasKeyword(obj.c, 'defender'));
  if (seriousHit || pureDefenders.length > 0) {
    const chump = pureDefenders.length > 0 ? pureDefenders[0] : sortedByValue[0];
    commitBlock(chump, aIdx, availableBlockers);
    logMsg(`🛡️ El Tano sacrifica a ${chump.c.card.name} para amortiguar el Arrollar de tu ${att.card.name}.`);
  }
}

function commitBlock(blockerItem, aIdx, availableBlockers) {
  state.rivalCombat[blockerItem.i].blockingIndex = aIdx;
  const idx = availableBlockers.indexOf(blockerItem);
  if (idx !== -1) availableBlockers.splice(idx, 1);
}

// NUEVA FUNCIÓN: Llamada por la IA durante la fase de bloqueadores
export function assignBotBlockers() {
  const attackers = state.localCombat.filter(c => c.isAttacking);
  if (attackers.length === 0) return;

  let availableBlockers = state.rivalCombat.map((c, i) => ({c, i})).filter(obj => !obj.c.tapped);

  const attackerIndexesSorted = state.localCombat
    .map((c, idx) => idx)
    .filter(idx => state.localCombat[idx].isAttacking)
    .sort((a, b) => {
      const A = state.localCombat[a], B = state.localCombat[b];
      const aTrample = hasKeyword(A, 'trample') ? 1 : 0;
      const bTrample = hasKeyword(B, 'trample') ? 1 : 0;
      if (aTrample !== bTrample) return bTrample - aTrample;
      return getEffectivePower(B) - getEffectivePower(A);
    });

  attackerIndexesSorted.forEach(aIdx => {
    const att = state.localCombat[aIdx];
    if (availableBlockers.length === 0) return;

    if (hasKeyword(att, 'menace')) {
      let validBlockersIndexes = [];
      for (let i = 0; i < availableBlockers.length; i++) {
        if (canBlock(att, availableBlockers[i].c)) {
          validBlockersIndexes.push(i);
          if (validBlockersIndexes.length === 2) break;
        }
      }
      if (validBlockersIndexes.length === 2) {
        validBlockersIndexes.reverse().forEach(idx => {
          let blockerObj = availableBlockers.splice(idx, 1)[0];
          state.rivalCombat[blockerObj.i].blockingIndex = aIdx;
        });
        logMsg(`👥 ¡Amenaza! El Tano te bloquea en pandilla a ${att.card.name}.`);
      }
      return;
    }
    assignSmartBlock(att, aIdx, availableBlockers);
  });
  logMsg(`🛡️ El Tano ha asignado sus defensores.`);
}

// Conserva la información de "esta criatura fue bloqueada" aunque todos sus bloqueadores
// abandonen el campo antes del daño. Con Trigger Stack esto dejó de ser un edge hipotético:
// responder al blockTrigger destruyendo/rebotando al bloqueador no vuelve al atacante
// mágicamente "no bloqueado". Sin Arrollar, sigue sin pegar al jugador.
export function markDeclaredBlocks(attackers, defenders) {
  (attackers || []).forEach((attacker, aIdx) => {
    if (!attacker?.isAttacking) return;
    if ((defenders || []).some(defender => defender?.blockingIndex == aIdx)) {
      attacker.wasBlockedThisCombat = true;
    }
  });
}

function isUnitStillOnBattlefield(item) {
  return state.localCombat.includes(item) || state.rivalCombat.includes(item);
}

export async function executeLocalAttack() {
  const attackers = state.localCombat.filter(c => c.isAttacking);
  state.localAttackersDeclaredThisTurn = attackers.length;
  
  if (attackers.length > 0) {
    attackers.forEach(a => {
      if (!hasKeyword(a, 'vigilance')) a.tapped = true;
      triggerCombatAbility(a, 'attackTrigger', true);
    });
    triggerAnyCreatureAttacks(true);
    logMsg(`🗡️ Declaraste ${attackers.length} atacantes.`);
  } else {
    logMsg(`🌅 Decidiste no atacar con nada.`);
  }
  render();
  passPriority('local'); // Pasamos la prioridad para avanzar la fase
}

export function executeRivalAttack() {
  // --- VALIDACIÓN DE AMENAZA (JUGADOR DEFIENDE) ---
  let invalidBlocks = false;

  state.rivalCombat.forEach((attacker, aIdx) => {
    if (attacker.isAttacking && hasKeyword(attacker, 'menace')) {
      const blockersCount = state.localCombat.filter(d => d.blockingIndex == aIdx).length;

      if (blockersCount === 1) {
        logMsg(`❌ ¡Epa! ${attacker.card.name} tiene Amenaza. Necesitás bloquearlo con 2 o más criaturas (o dejarlo pasar).`);
        invalidBlocks = true;
      }
    }
  });

  if (invalidBlocks) {
    state.localCombat.forEach(c => c.blockingIndex = null);
    logMsg("⚠️ Se anularon tus defensas por un movimiento ilegal. Volvé a asignar a tus defensores y confirmá.");
    render();
    return; // Detenemos para que el jugador corrija
  }

  markDeclaredBlocks(state.rivalCombat, state.localCombat);
  queueDeclaredBlockTriggers(state.localCombat, true);
  logMsg(`🛡️ Confirmaste tus bloqueos.`);
  render();
  // Si hubo blockTrigger, queueTriggeredAbility reseteó consecutivePasses; este pase es
  // NUEVO respecto de esa Stack y le entrega al atacante una ventana real de respuesta.
  passPriority('local');
}

// --- GOLPE PRIMERO (First Strike) Y DAÑO DOBLE (Double Strike) ---
function isCreatureDead(item) {
  const dmg = item.damageTaken || 0;
  return dmg >= getEffectiveToughness(item) || (item.tookDeathtouch && dmg > 0);
}

function dealsInFirstStrikeStep(item) {
  return hasKeyword(item, 'firststrike') || hasKeyword(item, 'doublestrike');
}
function dealsInRegularStep(item) {
  return !hasKeyword(item, 'firststrike') || hasKeyword(item, 'doublestrike');
}

// Trigger Stack: si el daño de iniciativa genera habilidades disparadas, hay que abrir una
// ventana de prioridad ANTES del daño regular. Conservamos el snapshot de pares en memoria
// para que una criatura muerta en iniciativa no desplace índices y reasigne bloqueos al volver.
let pendingCombatDamageContinuation = null;

export function hasPendingCombatDamageContinuation() {
  return !!pendingCombatDamageContinuation;
}

function finishCombatDamageStep(attackersArray, defendersArray) {
  attackersArray.forEach(c => {
    c.isAttacking = false;
    c.wasBlockedThisCombat = false;
    c.tookDeathtouch = false;
    c.blockTriggerQueuedThisCombat = false;
  });
  defendersArray.forEach(c => {
    c.blockingIndex = null;
    c.tookDeathtouch = false;
    c.blockTriggerQueuedThisCombat = false;
  });
  state.pendingBlockerIndex = null;
}

// Nota: se ejecuta automáticamente en turnManager en el paso 'combat_damage'. Si existe una
// continuación pendiente, esta llamada es la segunda mitad (daño regular después de que la
// Stack de iniciativa quedó vacía).
export async function resolveCombatDamage() {
  if (pendingCombatDamageContinuation) {
    const { combatPairs, isLocalAttacking, attackersArray, defendersArray } = pendingCombatDamageContinuation;
    pendingCombatDamageContinuation = null;
    logMsg("⚔️ --- Paso de Daño Regular ---");
    await resolveDamageSubStep(combatPairs, isLocalAttacking, dealsInRegularStep);
    checkAllDeaths();
    finishCombatDamageStep(attackersArray, defendersArray);
    return;
  }

  const isLocalAttacking = state.activePlayer === 'local';
  const attackersArray = isLocalAttacking ? state.localCombat : state.rivalCombat;
  const defendersArray = isLocalAttacking ? state.rivalCombat : state.localCombat;

  const combatPairs = attackersArray
    .filter(a => a.isAttacking)
    .map(attacker => ({
      attacker,
      blockers: defendersArray.filter(d => d.blockingIndex == attackersArray.indexOf(attacker))
    }));

  if (combatPairs.length === 0) {
    finishCombatDamageStep(attackersArray, defendersArray);
    return;
  }

  // Fog: no hay daño; tampoco nacen combatDamageTrigger. Se limpian flags normalmente.
  if (state.combatDamagePrevented) {
    logMsg("🌫️ El daño de combate de este turno queda prevenido por completo.");
    finishCombatDamageStep(attackersArray, defendersArray);
    return;
  }

  const hayIniciativa = combatPairs.some(({ attacker, blockers }) =>
    dealsInFirstStrikeStep(attacker) || blockers.some(dealsInFirstStrikeStep)
  );

  if (hayIniciativa) {
    const serialBefore = state.triggerStackSerial || 0;
    logMsg("⚡ --- Paso de Daño de Iniciativa (Golpe Primero) ---");
    await resolveDamageSubStep(combatPairs, isLocalAttacking, dealsInFirstStrikeStep);
    checkAllDeaths();

    // Si iniciativa produjo combatDamage/dies/anyDies/etc., no seguimos de largo: esas
    // habilidades quedan en Stack y ambos jugadores pueden responder. Cuando la pila quede
    // vacía y vuelvan a pasar, turnManager reingresa acá para ejecutar el daño regular.
    if ((state.triggerStackSerial || 0) > serialBefore) {
      pendingCombatDamageContinuation = { combatPairs, isLocalAttacking, attackersArray, defendersArray };
      logMsg("⏸️ El daño regular espera: hay habilidades disparadas de iniciativa en la pila.");
      return;
    }
    logMsg("⚔️ --- Paso de Daño Regular ---");
  }

  await resolveDamageSubStep(combatPairs, isLocalAttacking, dealsInRegularStep);
  checkAllDeaths();
  finishCombatDamageStep(attackersArray, defendersArray);
}

// Infectar (regla real 702.90): una criatura con Infectar hace TODO su daño de combate de
// forma alternativa — a otra criatura, en vez de dañarla normalmente, le pone contadores
// -1/-1 (que además YA reducen su resistencia efectiva sola, vía getEffectiveToughness —
// el mismo sistema que ya usa Proliferar y Lealtad); a un jugador, en vez de bajarle HP, le
// pone contadores de Veneno. A un Planeswalker NO le cambia nada: sigue siendo pérdida de
// Lealtad normal, como en MTG real (Infectar solo altera daño a jugadores y a criaturas).
function dealCombatDamageToCreature(source, targetItem, amount) {
  if (amount <= 0) return;
  if (hasKeyword(source, 'infect')) {
    addCounters(targetItem, 'minusOne', amount);
    logMsg(`☠️ ¡Infectar! ${targetItem.card.name} recibió ${amount} contador(es) -1/-1 de ${source.card.name}.`);
  } else {
    targetItem.damageTaken = (targetItem.damageTaken || 0) + amount;
  }
}

function dealCombatDamageToPlayer(source, isTargetLocal, amount) {
  if (amount <= 0) return;
  if (hasKeyword(source, 'infect')) {
    if (isTargetLocal) state.localPoison = (state.localPoison || 0) + amount;
    else state.rivalPoison = (state.rivalPoison || 0) + amount;
    logMsg(`☠️ ¡Infectar! ${source.card.name} le puso ${amount} contador(es) de Veneno a ${isTargetLocal ? 'Vos' : getRivalName()}.`);
  } else {
    if (isTargetLocal) state.localHP -= amount;
    else state.rivalHP -= amount;
  }
}

async function resolveDamageSubStep(combatPairs, isLocalAttacking, stepFilter) {
  for (const { attacker, blockers } of combatPairs) {
    // Entre Iniciativa y daño regular ahora puede resolverse una Stack completa. Una
    // criatura destruida/rebotada/exiliada durante esa ventana no puede seguir pegando
    // desde una referencia JS vieja guardada en combatPairs.
    if (!isUnitStillOnBattlefield(attacker) || isCreatureDead(attacker)) continue;

    const attackerDealsThisStep = stepFilter(attacker);
    const attackerPower = getEffectivePower(attacker);
    const attackerHasLifelink = hasKeyword(attacker, 'lifelink') || hasKeyword(attacker, 'life_link');
    const attackerHasDeathtouch = hasKeyword(attacker, 'deathtouch');
    const attackerHasTrample = hasKeyword(attacker, 'trample');

    const aliveBlockers = blockers.filter(b => isUnitStillOnBattlefield(b) && !isCreatureDead(b));

    aliveBlockers.forEach(blocker => {
      if (!stepFilter(blocker)) return; 

      const bPower = getEffectivePower(blocker);
      const blockerHasLifelink = hasKeyword(blocker, 'lifelink') || hasKeyword(blocker, 'life_link');
      const blockerHasDeathtouch = hasKeyword(blocker, 'deathtouch');

      // Protección de [color]: si el atacante tiene Protección del color de ESTE
      // bloqueador, ese bloqueador en particular no le hace nada — ni daño, ni Toque
      // Mortal, ni le da Vínculo Vital a su controlador (sin daño real, no hay nada que
      // curar). Caso raro (normalmente canBlock ya frena el bloqueo de entrada), pero
      // cubre situaciones donde el atacante gana Protección recién después de bloquearse.
      if (getProtectionMatch(attacker, blocker.card.colors || [])) {
        return;
      }

      // Se aplica POR bloqueador (no como un total acumulado) para que un bloqueo múltiple
      // con bloqueadores mezclados (algunos con Infectar, otros sin) redirija cada parte
      // por separado — cada uno decide su propio destino (contador -1/-1 o daño normal).
      dealCombatDamageToCreature(blocker, attacker, bPower);

      if (blockerHasLifelink && bPower > 0) {
        if (isLocalAttacking) {
          state.rivalHP += bPower;
          logMsg(`💚 Vínculo Vital: ${getRivalName()} recupera ${bPower} HP por la defensa de ${blocker.card.name}.`);
        } else {
          state.localHP += bPower;
          logMsg(`💚 Vínculo Vital: Recuperás ${bPower} HP por la defensa de ${blocker.card.name}.`);
        }
      }
      if (blockerHasDeathtouch && bPower > 0) {
        attacker.tookDeathtouch = true;
      }
    });

    if (!attackerDealsThisStep) continue;

    // combatDamageTrigger ("cuando esta criatura le pega al jugador"): se acumula acá y se
    // dispara una sola vez al final, sea cual sea de los 4 caminos por los que el ataque
    // termine llegando al jugador (sin bloqueo, arrollar con todo muerto, arrollar
    // manual, o arrollar automático) — evitar repetir el disparo en cada rama por separado.
    let damageToPlayerThisStep = 0;

    const wasBlocked = !!attacker.wasBlockedThisCombat || blockers.length > 0;

    if (!wasBlocked) {
      if (attacker.attackTarget) {
        // Redirigido a un Planeswalker: el daño le resta Lealtad directo, nunca golpea al
        // jugador, y NO cuenta como "daño de combate al jugador" (no dispara
        // combatDamageTrigger — esa es específicamente sobre pegarle a un jugador).
        attacker.attackTarget.loyalty -= attackerPower;
        logMsg(`🔮 ¡${attacker.card.name} atacó a ${attacker.attackTarget.card.name} y le sacó ${attackerPower} de Lealtad! (queda en ${attacker.attackTarget.loyalty})`);
        if (attackerHasLifelink && attackerPower > 0) {
          if (isLocalAttacking) state.localHP += attackerPower; else state.rivalHP += attackerPower;
          logMsg(`💚 Vínculo Vital: ¡${attacker.card.name} te curó ${attackerPower} HP!`);
        }
        checkPlaneswalkerDeaths();
        continue;
      }
      if (isLocalAttacking) {
        dealCombatDamageToPlayer(attacker, false, attackerPower);
        if (attackerHasLifelink && attackerPower > 0) {
          state.localHP += attackerPower;
          logMsg(`💚 Vínculo Vital: ¡${attacker.card.name} te curó ${attackerPower} HP!`);
        }
      } else {
        dealCombatDamageToPlayer(attacker, true, attackerPower);
        if (attackerHasLifelink && attackerPower > 0) {
          state.rivalHP += attackerPower;
          logMsg(`💚 Vínculo Vital: ¡${attacker.card.name} curó ${attackerPower} HP a ${getRivalName()}!`);
        }
      }
      if (attackerPower > 0) logMsg(`💥 ${attacker.card.name} conectó el golpe! Hizo ${attackerPower} de daño.`);
      damageToPlayerThisStep += attackerPower;
      if (damageToPlayerThisStep > 0) {
        triggerCombatAbility(attacker, 'combatDamageTrigger', isLocalAttacking);
      }
      continue;
    }

    if (aliveBlockers.length === 0) {
      if (attackerHasTrample) {
        if (attacker.attackTarget) {
          attacker.attackTarget.loyalty -= attackerPower;
          logMsg(`🔮 Arrollar: los bloqueadores de ${attacker.card.name} ya habían caído en Iniciativa, así que TODO su daño (${attackerPower}) le pega de lleno a ${attacker.attackTarget.card.name}.`);
          if (attackerHasLifelink && attackerPower > 0) {
            if (isLocalAttacking) state.localHP += attackerPower; else state.rivalHP += attackerPower;
          }
          checkPlaneswalkerDeaths();
          continue;
        }
        if (isLocalAttacking) {
          dealCombatDamageToPlayer(attacker, false, attackerPower);
          if (attackerHasLifelink && attackerPower > 0) state.localHP += attackerPower;
        } else {
          dealCombatDamageToPlayer(attacker, true, attackerPower);
          if (attackerHasLifelink && attackerPower > 0) state.rivalHP += attackerPower;
        }
        logMsg(`🐘 Arrollar: los bloqueadores de ${attacker.card.name} ya habían caído en Iniciativa, así que TODO su daño (${attackerPower}) pasa de largo.`);
        damageToPlayerThisStep += attackerPower;
      } else {
        logMsg(`🛡️ ${attacker.card.name} sigue "bloqueado" (sus defensores cayeron en Iniciativa) y sin Arrollar no conecta nada.`);
      }
      if (damageToPlayerThisStep > 0) {
        triggerCombatAbility(attacker, 'combatDamageTrigger', isLocalAttacking);
      }
      continue;
    }

    let useManual = false;
    let manualDistribution = [];
    let manualPlayerDamage = 0;

    if (isLocalAttacking && (aliveBlockers.length > 1 || attackerHasTrample)) {
      const result = await new Promise((resolve) => {
        showDamageAssignmentModal(
          attacker,
          aliveBlockers,
          attackerPower,
          () => resolve({ type: 'auto' }),
          (distribucion, playerDmg) => resolve({ type: 'manual', distribucion, playerDmg })
        );
      });

      if (result.type === 'manual') {
        useManual = true;
        manualDistribution = result.distribucion;
        manualPlayerDamage = result.playerDmg;
      }
    }

    let remainingAttackerPower = attackerPower;
    let attackerLifelinkHeal = 0;

    aliveBlockers.forEach((blocker, bIdx) => {
      const bToughness = getEffectiveToughness(blocker);

      let damageToDeal = 0;

      if (useManual) {
        damageToDeal = manualDistribution[bIdx];
      } else {
        const currentDamage = blocker.damageTaken || 0;
        const remainingToughness = Math.max(0, bToughness - currentDamage);
        let damageToKill = attackerHasDeathtouch ? 1 : remainingToughness;

        damageToDeal = Math.min(remainingAttackerPower, damageToKill);

        if (bIdx === aliveBlockers.length - 1 && remainingAttackerPower > 0 && !attackerHasTrample) {
          damageToDeal = remainingAttackerPower;
        }
        remainingAttackerPower -= damageToDeal;
      }

      if (damageToDeal > 0) {
        const blockerProtected = getProtectionMatch(blocker, attacker.card.colors || []);
        if (blockerProtected) {
          // Protección de [color]: SÍ podía elegir bloquear (eso no se lo prohíbe), pero
          // el daño se previene entero al momento de aplicarse — mismo criterio que en
          // MTG real, la asignación ya ocurrió (no le "regala" ese poder a otro
          // bloqueador ni al jugador), simplemente ese daño puntual nunca llega a pasar.
          logMsg(`🛡️ ¡${blocker.card.name} tiene Protección de ${COLOR_LABELS[blockerProtected] || blockerProtected}! El daño de ${attacker.card.name} fue prevenido.`);
        } else {
          dealCombatDamageToCreature(attacker, blocker, damageToDeal);
          attackerLifelinkHeal += damageToDeal;
          if (attackerHasDeathtouch) blocker.tookDeathtouch = true;
        }
      }
    });

    if (useManual) {
      if (manualPlayerDamage > 0) {
        if (attacker.attackTarget) {
          // Arrollar redirigido a un Planeswalker: el sobrante también le come Lealtad a
          // ÉL, no a la cara del jugador — antes este camino (asignación manual) no
          // chequeaba attackTarget para nada y siempre le pegaba al jugador.
          attacker.attackTarget.loyalty -= manualPlayerDamage;
          logMsg(`🐘 Arrollar (Asignado): ¡${attacker.card.name} le arrolló ${manualPlayerDamage} de daño a ${attacker.attackTarget.card.name}! (Lealtad: ${attacker.attackTarget.loyalty})`);
          attackerLifelinkHeal += manualPlayerDamage;
          checkPlaneswalkerDeaths();
        } else {
          if (isLocalAttacking) dealCombatDamageToPlayer(attacker, false, manualPlayerDamage);
          else dealCombatDamageToPlayer(attacker, true, manualPlayerDamage);
          attackerLifelinkHeal += manualPlayerDamage;
          logMsg(`🐘 Arrollar (Asignado): ¡${attacker.card.name} arrolló con ${manualPlayerDamage} de daño!`);
          damageToPlayerThisStep += manualPlayerDamage;
        }
      }
    } else if (attackerHasTrample && remainingAttackerPower > 0) {
      if (attacker.attackTarget) {
        // Mismo caso, para el reparto automático (sin asignación manual).
        attacker.attackTarget.loyalty -= remainingAttackerPower;
        logMsg(`🐘 Arrollar: ¡${attacker.card.name} repartió daño letal a sus bloqueadores y le arrolló ${remainingAttackerPower} de daño a ${attacker.attackTarget.card.name}! (Lealtad: ${attacker.attackTarget.loyalty})`);
        attackerLifelinkHeal += remainingAttackerPower;
        checkPlaneswalkerDeaths();
      } else if (isLocalAttacking) {
        dealCombatDamageToPlayer(attacker, false, remainingAttackerPower);
        logMsg(`🐘 Arrollar: ¡${attacker.card.name} repartió daño letal a los bloqueadores y arrolló con ${remainingAttackerPower} de daño a ${getRivalName()}!`);
        attackerLifelinkHeal += remainingAttackerPower;
        damageToPlayerThisStep += remainingAttackerPower;
      } else {
        dealCombatDamageToPlayer(attacker, true, remainingAttackerPower);
        logMsg(`🐘 Arrollar: ¡El ${attacker.card.name} de ${getRivalName()} repartió daño letal a tus defensores y te arrolló con ${remainingAttackerPower} de daño!`);
        attackerLifelinkHeal += remainingAttackerPower;
        damageToPlayerThisStep += remainingAttackerPower;
      }
    }

    if (damageToPlayerThisStep > 0) {
      triggerCombatAbility(attacker, 'combatDamageTrigger', isLocalAttacking);
    }

    if (attackerHasLifelink && attackerLifelinkHeal > 0) {
      if (isLocalAttacking) {
        state.localHP += attackerLifelinkHeal;
        logMsg(`💚 Vínculo Vital: Recuperás ${attackerLifelinkHeal} HP por el ataque de ${attacker.card.name}.`);
      } else {
        state.rivalHP += attackerLifelinkHeal;
        logMsg(`💚 Vínculo Vital: ${getRivalName()} recupera ${attackerLifelinkHeal} HP por el ataque de ${attacker.card.name}.`);
      }
    }

    const blockNames = aliveBlockers.map(b => b.card.name).join(" y ");
    logMsg(`⚔️ Choque: ${attacker.card.name} se enfrenta a ${blockNames}.`);
  }
}

function unitDiesToStateBasedDamage(unit) {
  const dmg = unit.damageTaken || 0;
  const toughness = getEffectiveToughness(unit);
  const indestructible = hasKeyword(unit, 'indestructible');
  const diesToZeroToughness = toughness <= 0;
  const diesToLethalDamage = !indestructible && toughness > 0 && dmg >= toughness;
  const diesToDeathtouch = !indestructible && unit.tookDeathtouch && dmg > 0;
  return diesToZeroToughness || diesToLethalDamage || diesToDeathtouch;
}

function removeDeadCombatUnit(unit, isLocal) {
  const combatArray = isLocal ? state.localCombat : state.rivalCombat;
  const graveyardArray = isLocal ? state.localGraveyard : state.rivalGraveyard;
  const ownerName = isLocal ? 'Vos' : getRivalName();
  const idx = combatArray.indexOf(unit);
  if (idx === -1) return false;

  logMsg(unit.card.isToken
    ? `💀 ${unit.card.name} de ${ownerName} murió; al ser ficha, deja de existir.`
    : `💀 ${unit.card.name} de ${ownerName} murió y va al cementerio.`);
  combatArray.splice(idx, 1);
  moveBattlefieldCardToZone(unit.card, graveyardArray);
  sendAurasToGraveyard(unit, isLocal);
  cleanupIfVehicle(unit);
  detachEquipmentFrom(unit, isLocal);
  return true;
}

// Trigger Stack: las acciones basadas en estado posteriores a un mismo bloque de daño se
// aplican simultáneamente a AMBOS lados. Primero fotografiamos todos los watchers, luego
// retiramos todos los muertos y recién después apilamos el lote completo de disparos.
export function checkAllDeaths() {
  const watchersSnapshot = [
    ...state.localCombat.map(unit => ({ unit, isLocal: true })),
    ...state.rivalCombat.map(unit => ({ unit, isLocal: false }))
  ];
  const doomed = [
    ...state.localCombat.filter(unitDiesToStateBasedDamage).map(unit => ({ unit, isLocal: true })),
    ...state.rivalCombat.filter(unitDiesToStateBasedDamage).map(unit => ({ unit, isLocal: false }))
  ];
  if (doomed.length === 0) return [];

  const removed = doomed.filter(({ unit, isLocal }) => removeDeadCombatUnit(unit, isLocal));
  queueCreatureDeathBatch(removed, watchersSnapshot);
  return removed.map(entry => entry.unit);
}

// API histórica para chequeos puntuales de una sola zona. El runtime nuevo usa
// checkAllDeaths() cuando ambas mitades pueden morir por el mismo evento; conservamos este
// wrapper para caminos/fixtures antiguos que verdaderamente inspeccionan una sola zona.
export function checkDeaths(combatArray, graveyardArray, ownerName) {
  const isLocal = combatArray === state.localCombat || ownerName === 'Vos';
  const watchersSnapshot = [
    ...state.localCombat.map(unit => ({ unit, isLocal: true })),
    ...state.rivalCombat.map(unit => ({ unit, isLocal: false }))
  ];
  const doomed = combatArray.filter(unitDiesToStateBasedDamage).map(unit => ({ unit, isLocal }));
  const removed = doomed.filter(({ unit, isLocal: ownerIsLocal }) => removeDeadCombatUnit(unit, ownerIsLocal));
  queueCreatureDeathBatch(removed, watchersSnapshot);
  return removed.map(entry => entry.unit);
}
