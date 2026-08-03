import { hasKeyword, canBlock } from './keywords.js';
import { 
  state, 
  logMsg, 
  getEffectivePower, 
  getEffectiveToughness, 
  render, 
  startLocalTurn 
} from './main.js';
import { showDamageAssignmentModal } from './ui.js'; // <-- Importamos el modal

export async function executeLocalAttack() {
  const attackers = state.localCombat.filter(c => c.isAttacking);
  
   if (attackers.length > 0) {
    attackers.forEach(a => {
      if (!hasKeyword(a, 'vigilance')) {
        a.tapped = true;
      }
    });
    logMsg(`🗡️ Declaraste ${attackers.length} atacantes.`);

    let availableBlockers = state.rivalCombat.map((c, i) => ({c, i})).filter(obj => !obj.c.tapped);
    
    state.localCombat.forEach((att, aIdx) => {
      if (att.isAttacking && availableBlockers.length > 0) {
        
        // --- CHEQUEO DE AMENAZA (BOT DEFIENDE) ---
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
        } else {
          // --- LÓGICA NORMAL (1 BLOQUEADOR) ---
          let validBlockerIndex = availableBlockers.findIndex(obj => canBlock(att, obj.c));
          if (validBlockerIndex !== -1) {
            let blockerObj = availableBlockers.splice(validBlockerIndex, 1)[0];
            state.rivalCombat[blockerObj.i].blockingIndex = aIdx;
            logMsg(`🛡️ El Tano bloquea a tu ${att.card.name} usando su ${blockerObj.c.card.name}.`);
          }
        }
      }
    });

    // Await para esperar las resoluciones manuales del jugador
    await resolveCombatDamage(state.localCombat, state.rivalCombat, true);
  }

  state.phase = 'main2';
  logMsg("🌅 Terminó el combate. Arranca tu 2da Fase Principal.");
  render();
}

export async function executeRivalAttack() {
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
    return; 
  }

  logMsg(`🛡️ Resolviendo combates...`);
  // Await integrado para mantener consistencia, aunque el bot no usa UI
  await resolveCombatDamage(state.rivalCombat, state.localCombat, false);
  
  startLocalTurn(); 
}

// Convertida a async para poder pausar con el modal
export async function resolveCombatDamage(attackersArray, defendersArray, isLocalAttacking) {
  // Usamos for...of para poder hacer await secuencial por cada atacante
  for (let aIdx = 0; aIdx < attackersArray.length; aIdx++) {
    const attacker = attackersArray[aIdx];
    if (!attacker.isAttacking) continue;

    let blockers = defendersArray.filter(d => d.blockingIndex == aIdx);
    const attackerPower = getEffectivePower(attacker);

    const attackerHasLifelink = hasKeyword(attacker, 'lifelink') || hasKeyword(attacker, 'life_link');
    const attackerHasDeathtouch = hasKeyword(attacker, 'deathtouch');
    const attackerHasTrample = hasKeyword(attacker, 'trample');

    if (blockers.length === 0) {
      // DAÑO DIRECTO A JUGADOR
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
    } else {
      
      // --- CHEQUEO DE UI DE ASIGNACIÓN MANUAL ---
      let useManual = false;
      let manualDistribution = [];
      let manualPlayerDamage = 0;

      // Solo abrimos el modal si vos sos el atacante y (tiene arrollar o te bloquearon con más de 1)
      if (isLocalAttacking && (blockers.length > 1 || attackerHasTrample)) {
        const result = await new Promise((resolve) => {
          showDamageAssignmentModal(
            attacker,
            blockers,
            attackerPower,
            () => resolve({ type: 'auto' }), // Automático
            (distribucion, playerDmg) => resolve({ type: 'manual', distribucion, playerDmg }) // Manual
          );
        });

        if (result.type === 'manual') {
          useManual = true;
          manualDistribution = result.distribucion;
          manualPlayerDamage = result.playerDmg;
        }
      }

      let totalBlockerPower = 0;
      let remainingAttackerPower = attackerPower;
      let attackerLifelinkHeal = 0;

      blockers.forEach((blocker, bIdx) => {
        const bPower = getEffectivePower(blocker);
        const bToughness = getEffectiveToughness(blocker);

        const blockerHasLifelink = hasKeyword(blocker, 'lifelink') || hasKeyword(blocker, 'life_link');
        const blockerHasDeathtouch = hasKeyword(blocker, 'deathtouch');

        totalBlockerPower += bPower; 

        // 1. Vínculo Vital del Bloqueador (pasa igual siempre)
        if (blockerHasLifelink && bPower > 0) {
          if (isLocalAttacking) {
            state.rivalHP += bPower; 
            logMsg(`💚 Vínculo Vital: El Tano recupera ${bPower} HP por la defensa de ${blocker.card.name}.`);
          } else {
            state.localHP += bPower; 
            logMsg(`💚 Vínculo Vital: Recuperás ${bPower} HP por la defensa de ${blocker.card.name}.`);
          }
        }

        // 2. Toque Mortal del Bloqueador hacia el Atacante
        if (blockerHasDeathtouch && bPower > 0) {
          attacker.tookDeathtouch = true;
        }

        // 3. Resolución de daño sobre el bloqueador
        let damageToDeal = 0;

        if (useManual) {
          // Asignación de la UI
          damageToDeal = manualDistribution[bIdx];
        } else {
          // Asignación automática (la que ya tenías)
          const currentDamage = blocker.damageTaken || 0;
          const remainingToughness = Math.max(0, bToughness - currentDamage);
          let damageToKill = attackerHasDeathtouch ? 1 : remainingToughness;
          
          damageToDeal = Math.min(remainingAttackerPower, damageToKill);

          if (bIdx === blockers.length - 1 && remainingAttackerPower > 0 && !attackerHasTrample) {
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

      // El atacante recibe el daño total de las criaturas bloqueadoras
      attacker.damageTaken = (attacker.damageTaken || 0) + totalBlockerPower;

      // 4. DAÑO ARROLLAR (TRAMPLE) AL JUGADOR
      if (useManual) {
        if (manualPlayerDamage > 0) {
          state.rivalHP -= manualPlayerDamage;
          attackerLifelinkHeal += manualPlayerDamage;
          logMsg(`🐘 Arrollar (Asignado): ¡${attacker.card.name} arrolló con ${manualPlayerDamage} de daño al Tano!`);
        }
      } else {
        if (attackerHasTrample && remainingAttackerPower > 0) {
          if (isLocalAttacking) {
            state.rivalHP -= remainingAttackerPower;
            logMsg(`🐘 Arrollar: ¡${attacker.card.name} repartió daño letal a los bloqueadores y arrolló con ${remainingAttackerPower} de daño al Tano!`);
          } else {
            state.localHP -= remainingAttackerPower;
            logMsg(`🐘 Arrollar: ¡El ${attacker.card.name} del Tano repartió daño letal a tus defensores y te arrolló con ${remainingAttackerPower} de daño!`);
          }
          attackerLifelinkHeal += remainingAttackerPower;
        }
      }

      // 5. Resolvemos la cura acumulada del atacante si tiene Vínculo Vital
      if (attackerHasLifelink && attackerLifelinkHeal > 0) {
        if (isLocalAttacking) {
          state.localHP += attackerLifelinkHeal;
          logMsg(`💚 Vínculo Vital: Recuperás ${attackerLifelinkHeal} HP por el ataque de ${attacker.card.name}.`);
        } else {
          state.rivalHP += attackerLifelinkHeal;
          logMsg(`💚 Vínculo Vital: El Tano recupera ${attackerLifelinkHeal} HP por el ataque de ${attacker.card.name}.`);
        }
      }

      const blockNames = blockers.map(b => b.card.name).join(" y ");
      logMsg(`⚔️ Choque: ${attacker.card.name} se enfrenta a ${blockNames}.`);
    }
  } // Fin del for de atacantes

  checkDeaths(state.localCombat, state.localGraveyard, "Vos");
  checkDeaths(state.rivalCombat, state.rivalGraveyard, "El Tano");

  // Limpieza al finalizar combate
  attackersArray.forEach(c => { c.isAttacking = false; c.tookDeathtouch = false; });
  defendersArray.forEach(c => { c.blockingIndex = null; c.tookDeathtouch = false; });
  state.pendingBlockerIndex = null;
}

export function checkDeaths(combatArray, graveyardArray, ownerName) {
  for (let i = combatArray.length - 1; i >= 0; i--) {
    let unit = combatArray[i];
    let dmg = unit.damageTaken || 0;
    
    if (dmg >= getEffectiveToughness(unit) || (unit.tookDeathtouch && dmg > 0)) {
      logMsg(`💀 ${unit.card.name} de ${ownerName} murió y va al cementerio.`);
      graveyardArray.push(unit.card);
      if (unit.auras && unit.auras.length > 0) {
        unit.auras.forEach(auraCard => {
          logMsg(`💔 ${auraCard.name} se desprendió y también fue al cementerio.`);
          graveyardArray.push(auraCard);
        });
      }
      combatArray.splice(i, 1);
    }
  }
}
