import { hasKeyword, canBlock, predictDuel } from './keywords.js';
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
  resolveEffectDirect,
  cleanupIfVehicle
} from './main.js';
import { showDamageAssignmentModal } from './ui.js';

// Habilidades Disparadas de combate ("cuando ataca", "cuando bloquea", "cuando le pega
// al jugador"): la tercera pata que le faltaba al motor de disparadores. Misma
// simplificación que el resto (resuelve directo, sin pasar por la pila).
export function triggerCombatAbility(unit, triggerKey, isLocal) {
  const trig = unit.card[triggerKey];
  if (!trig) return;
  resolveEffectDirect(trig, unit.card.name, isLocal);
}

// A diferencia de attackTrigger/blockTrigger (que viven en la criatura misma), este vive en
// la zona de soporte — para Encantamientos/Artefactos que reaccionan a "atacaste con 1 o
// más criaturas este combate" sin ser ellos mismos quienes atacan.
export function triggerAnyCreatureAttacks(isLocal) {
  const support = isLocal ? state.localSupport : state.rivalSupport;
  support.forEach(s => {
    if (s.card.anyCreatureAttacksTrigger) {
      resolveEffectDirect(s.card.anyCreatureAttacksTrigger, s.card.name, isLocal);
    }
  });
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

export function executeLocalAttack() {
  const attackers = state.localCombat.filter(c => c.isAttacking);
  state.localAttackersDeclaredThisTurn = attackers.length;
  
  if (attackers.length > 0) {
    attackers.forEach(a => {
      if (!hasKeyword(a, 'vigilance')) {
        a.tapped = true;
      }
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

  logMsg(`🛡️ Confirmaste tus bloqueos.`);
  render();
  passPriority('local'); // Avanzamos la fase
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

// Nota: se ejecuta automáticamente en turnManager en el paso 'combat_damage'
export async function resolveCombatDamage() {
  const isLocalAttacking = state.activePlayer === 'local';
  const attackersArray = isLocalAttacking ? state.localCombat : state.rivalCombat;
  const defendersArray = isLocalAttacking ? state.rivalCombat : state.localCombat;

  // blockTrigger: se dispara una sola vez por bloqueadora, acá — sin importar por cuál de
  // los 3 caminos se asignó el bloqueo (jugador local, o el Tano en sus 2 ramas), para
  // cuando llega este paso los bloqueos ya están definidos y es el único lugar seguro.
  defendersArray.forEach(d => {
    if (d.blockingIndex !== null && d.blockingIndex !== undefined) {
      triggerCombatAbility(d, 'blockTrigger', !isLocalAttacking);
    }
  });

  const combatPairs = attackersArray
    .filter(a => a.isAttacking)
    .map(attacker => ({
      attacker,
      blockers: defendersArray.filter(d => d.blockingIndex == attackersArray.indexOf(attacker))
    }));

  if (combatPairs.length === 0) return;

  // Fog (ej. "Que Pare Todo"): se previene TODO el daño de combate de este turno. Igual
  // limpiamos las flags de atacante/bloqueador al final, como en cualquier otro combate.
  if (state.combatDamagePrevented) {
    logMsg("🌫️ El daño de combate de este turno queda prevenido por completo.");
    attackersArray.forEach(c => { c.isAttacking = false; c.tookDeathtouch = false; });
    defendersArray.forEach(c => { c.blockingIndex = null; c.tookDeathtouch = false; });
    state.pendingBlockerIndex = null;
    return;
  }

  const hayIniciativa = combatPairs.some(({ attacker, blockers }) =>
    dealsInFirstStrikeStep(attacker) || blockers.some(dealsInFirstStrikeStep)
  );

  if (hayIniciativa) {
    logMsg("⚡ --- Paso de Daño de Iniciativa (Golpe Primero) ---");
    await resolveDamageSubStep(combatPairs, isLocalAttacking, dealsInFirstStrikeStep);

    checkDeaths(state.localCombat, state.localGraveyard, "Vos");
    checkDeaths(state.rivalCombat, state.rivalGraveyard, "El Tano");

    logMsg("⚔️ --- Paso de Daño Regular ---");
  }

  await resolveDamageSubStep(combatPairs, isLocalAttacking, dealsInRegularStep);

  checkDeaths(state.localCombat, state.localGraveyard, "Vos");
  checkDeaths(state.rivalCombat, state.rivalGraveyard, "El Tano");

  attackersArray.forEach(c => { c.isAttacking = false; c.tookDeathtouch = false; });
  defendersArray.forEach(c => { c.blockingIndex = null; c.tookDeathtouch = false; });
  state.pendingBlockerIndex = null;
}

async function resolveDamageSubStep(combatPairs, isLocalAttacking, stepFilter) {
  for (const { attacker, blockers } of combatPairs) {
    if (isCreatureDead(attacker)) continue;

    const attackerDealsThisStep = stepFilter(attacker);
    const attackerPower = getEffectivePower(attacker);
    const attackerHasLifelink = hasKeyword(attacker, 'lifelink') || hasKeyword(attacker, 'life_link');
    const attackerHasDeathtouch = hasKeyword(attacker, 'deathtouch');
    const attackerHasTrample = hasKeyword(attacker, 'trample');

    const aliveBlockers = blockers.filter(b => !isCreatureDead(b));

    let totalBlockerPowerThisStep = 0;
    aliveBlockers.forEach(blocker => {
      if (!stepFilter(blocker)) return; 

      const bPower = getEffectivePower(blocker);
      const blockerHasLifelink = hasKeyword(blocker, 'lifelink') || hasKeyword(blocker, 'life_link');
      const blockerHasDeathtouch = hasKeyword(blocker, 'deathtouch');

      totalBlockerPowerThisStep += bPower;

      if (blockerHasLifelink && bPower > 0) {
        if (isLocalAttacking) {
          state.rivalHP += bPower;
          logMsg(`💚 Vínculo Vital: El Tano recupera ${bPower} HP por la defensa de ${blocker.card.name}.`);
        } else {
          state.localHP += bPower;
          logMsg(`💚 Vínculo Vital: Recuperás ${bPower} HP por la defensa de ${blocker.card.name}.`);
        }
      }
      if (blockerHasDeathtouch && bPower > 0) {
        attacker.tookDeathtouch = true;
      }
    });

    if (totalBlockerPowerThisStep > 0) {
      attacker.damageTaken = (attacker.damageTaken || 0) + totalBlockerPowerThisStep;
    }

    if (!attackerDealsThisStep) continue;

    // combatDamageTrigger ("cuando esta criatura le pega al jugador"): se acumula acá y se
    // dispara una sola vez al final, sea cual sea de los 4 caminos por los que el ataque
    // termine llegando al jugador (sin bloqueo, arrollar con todo muerto, arrollar
    // manual, o arrollar automático) — evitar repetir el disparo en cada rama por separado.
    let damageToPlayerThisStep = 0;

    if (blockers.length === 0) {
      if (isLocalAttacking) {
        state.rivalHP -= attackerPower;
        if (attackerHasLifelink && attackerPower > 0) {
          state.localHP += attackerPower;
          logMsg(`💚 Vínculo Vital: ¡${attacker.card.name} te curó ${attackerPower} HP!`);
        }
      } else {
        state.localHP -= attackerPower;
        if (attackerHasLifelink && attackerPower > 0) {
          state.rivalHP += attackerPower;
          logMsg(`💚 Vínculo Vital: ¡${attacker.card.name} curó ${attackerPower} HP al Tano!`);
        }
      }
      if (attackerPower > 0) logMsg(`💥 ${attacker.card.name} conectó el golpe! Hizo ${attackerPower} de daño.`);
      damageToPlayerThisStep += attackerPower;
      if (damageToPlayerThisStep > 0) triggerCombatAbility(attacker, 'combatDamageTrigger', isLocalAttacking);
      continue;
    }

    if (aliveBlockers.length === 0) {
      if (attackerHasTrample) {
        if (isLocalAttacking) {
          state.rivalHP -= attackerPower;
          if (attackerHasLifelink && attackerPower > 0) state.localHP += attackerPower;
        } else {
          state.localHP -= attackerPower;
          if (attackerHasLifelink && attackerPower > 0) state.rivalHP += attackerPower;
        }
        logMsg(`🐘 Arrollar: los bloqueadores de ${attacker.card.name} ya habían caído en Iniciativa, así que TODO su daño (${attackerPower}) pasa de largo.`);
        damageToPlayerThisStep += attackerPower;
      } else {
        logMsg(`🛡️ ${attacker.card.name} sigue "bloqueado" (sus defensores cayeron en Iniciativa) y sin Arrollar no conecta nada.`);
      }
      if (damageToPlayerThisStep > 0) triggerCombatAbility(attacker, 'combatDamageTrigger', isLocalAttacking);
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
        blocker.damageTaken = (blocker.damageTaken || 0) + damageToDeal;
        attackerLifelinkHeal += damageToDeal;
        if (attackerHasDeathtouch) blocker.tookDeathtouch = true;
      }
    });

    if (useManual) {
      if (manualPlayerDamage > 0) {
        if (isLocalAttacking) state.rivalHP -= manualPlayerDamage;
        else state.localHP -= manualPlayerDamage;
        attackerLifelinkHeal += manualPlayerDamage;
        logMsg(`🐘 Arrollar (Asignado): ¡${attacker.card.name} arrolló con ${manualPlayerDamage} de daño!`);
        damageToPlayerThisStep += manualPlayerDamage;
      }
    } else if (attackerHasTrample && remainingAttackerPower > 0) {
      if (isLocalAttacking) {
        state.rivalHP -= remainingAttackerPower;
        logMsg(`🐘 Arrollar: ¡${attacker.card.name} repartió daño letal a los bloqueadores y arrolló con ${remainingAttackerPower} de daño al Tano!`);
      } else {
        state.localHP -= remainingAttackerPower;
        logMsg(`🐘 Arrollar: ¡El ${attacker.card.name} del Tano repartió daño letal a tus defensores y te arrolló con ${remainingAttackerPower} de daño!`);
      }
      attackerLifelinkHeal += remainingAttackerPower;
      damageToPlayerThisStep += remainingAttackerPower;
    }

    if (damageToPlayerThisStep > 0) triggerCombatAbility(attacker, 'combatDamageTrigger', isLocalAttacking);

    if (attackerHasLifelink && attackerLifelinkHeal > 0) {
      if (isLocalAttacking) {
        state.localHP += attackerLifelinkHeal;
        logMsg(`💚 Vínculo Vital: Recuperás ${attackerLifelinkHeal} HP por el ataque de ${attacker.card.name}.`);
      } else {
        state.rivalHP += attackerLifelinkHeal;
        logMsg(`💚 Vínculo Vital: El Tano recupera ${attackerLifelinkHeal} HP por el ataque de ${attacker.card.name}.`);
      }
    }

    const blockNames = aliveBlockers.map(b => b.card.name).join(" y ");
    logMsg(`⚔️ Choque: ${attacker.card.name} se enfrenta a ${blockNames}.`);
  }
}

export function checkDeaths(combatArray, graveyardArray, ownerName) {
  const isLocal = ownerName === "Vos";

  for (let i = combatArray.length - 1; i >= 0; i--) {
    let unit = combatArray[i];
    let dmg = unit.damageTaken || 0;
    const toughness = getEffectiveToughness(unit);
    const indestructible = hasKeyword(unit, 'indestructible');

    // Indestructible previene morir por daño letal o por deathtouch (son "destrucción"),
    // pero NO previene morir si la resistencia efectiva queda en 0 o menos (eso no es
    // "destruir", es una regla aparte que ni Indestructible esquiva en MTG real).
    const diesToZeroToughness = toughness <= 0;
    const diesToLethalDamage = !indestructible && toughness > 0 && dmg >= toughness;
    const diesToDeathtouch = !indestructible && unit.tookDeathtouch && dmg > 0;

    if (diesToZeroToughness || diesToLethalDamage || diesToDeathtouch) {
      logMsg(`💀 ${unit.card.name} de ${ownerName} murió y va al cementerio.`);
      graveyardArray.push(unit.card);

      // Auras (y contadores +1/+1, que hoy viven en el mismo array): se van al cementerio
      // junto con la criatura. Misma función que usan el resto de los caminos de salida
      // del campo (rebote, sacrificio, removal, arrase) para no volver a duplicar esto.
      sendAurasToGraveyard(unit, isLocal);
      cleanupIfVehicle(unit); // si era un Vehículo tripulado, saca el power/toughness "prestado"

      // Equipamiento: a diferencia de las Auras, NO va al cementerio con la criatura.
      // Ya vive como su propio permanente en la zona de soporte — solo hay que
      // desprenderlo (attachedTo = null), se queda listo para volver a equiparse.
      detachEquipmentFrom(unit, isLocal);

      // Habilidad Disparada: "Siempre que una criatura que controla tu oponente muera..."
      // (ej. Milonga de Medianoche). Buscamos ese gatillo en la mesa del RIVAL de quien
      // acaba de perder la criatura, porque desde su perspectiva vos sos "el oponente".
      const opponentSupport = isLocal ? state.rivalSupport : state.localSupport;
      opponentSupport.forEach(item => {
        const trig = item.card.opponentDeathTrigger;
        if (!trig || trig.type !== 'drain') return;
        if (isLocal) { state.localHP -= trig.amount; state.rivalHP += trig.amount; }
        else { state.rivalHP -= trig.amount; state.localHP += trig.amount; }
        logMsg(`🩸 ¡${item.card.name}! Drena ${trig.amount} de vida por la muerte de ${unit.card.name}.`);
      });

      // Habilidad Disparada de la propia criatura: "Cuando esta criatura muera..."
      triggerCreatureDies(unit, isLocal);
      // Habilidad Disparada estilo Blood Artist: "Cuando CUALQUIER criatura muera..."
      triggerAnyCreatureDeath(unit, isLocal);

      combatArray.splice(i, 1);
    }
  }
}
