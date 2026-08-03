import { hasKeyword, canBlock } from './keywords.js';
import { 
  state, 
  logMsg, 
  getEffectivePower, 
  getEffectiveToughness, 
  render, 
  startLocalTurn 
} from './main.js';

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
        
        // --- NUEVO: CHEQUEO DE AMENAZA (BOT DEFIENDE) ---
        if (hasKeyword(att, 'menace')) {
          let validBlockersIndexes = [];
          
          // Buscamos 2 defensores viables en el array de disponibles del Tano
          for (let i = 0; i < availableBlockers.length; i++) {
            if (canBlock(att, availableBlockers[i].c)) {
              validBlockersIndexes.push(i);
              if (validBlockersIndexes.length === 2) break; // Ya tenemos la pandilla
            }
          }

          // Si el bot encontró 2, te los asigna. Si tiene 1 solo (o 0), lo tiene que dejar pasar.
          if (validBlockersIndexes.length === 2) {
            // Usamos reverse() para hacer splice sin desfasar los índices de availableBlockers
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
        // ------------------------------------------------
      }
    });

    resolveCombatDamage(state.localCombat, state.rivalCombat, true);
  }

  state.phase = 'main2';
  logMsg("🌅 Terminó el combate. Arranca tu 2da Fase Principal.");
  render();
}

export function executeRivalAttack() {
  // --- NUEVA VALIDACIÓN DE AMENAZA (JUGADOR DEFIENDE) ---
  let invalidBlocks = false;

  state.rivalCombat.forEach((attacker, aIdx) => {
    if (attacker.isAttacking && hasKeyword(attacker, 'menace')) {
      // Contamos cuántas criaturas asignaste a este atacante
      const blockersCount = state.localCombat.filter(d => d.blockingIndex === aIdx).length;

      // Si lo bloqueaste con exactamente 1, es ilegal. (0 o 2+)
      if (blockersCount === 1) {
        logMsg(`❌ ¡Epa! ${attacker.card.name} tiene Amenaza. Necesitás bloquearlo con 2 o más criaturas (o dejarlo pasar).`);
        invalidBlocks = true;
      }
    }
  });

  // Si bloqueaste mal, cancelamos la resolución y reseteamos tus bloqueos
  if (invalidBlocks) {
    state.localCombat.forEach(c => c.blockingIndex = null);
    logMsg("⚠️ Se anularon tus defensas por un movimiento ilegal. Volvé a asignar a tus defensores y confirmá.");
    render();
    return; // Frenamos la función acá para que no haya daño.
  }
  // ------------------------------------------------------

  logMsg(`🛡️ Resolviendo combates...`);
  resolveCombatDamage(state.rivalCombat, state.localCombat, false);
  
  startLocalTurn(); 
}

export function resolveCombatDamage(attackersArray, defendersArray, isLocalAttacking) {
  attackersArray.forEach((attacker, aIdx) => {
    if (!attacker.isAttacking) return;

    let blockers = defendersArray.filter(d => d.blockingIndex === aIdx);
    const attackerPower = getEffectivePower(attacker);

    if (blockers.length === 0) {
      if (isLocalAttacking) state.rivalHP -= attackerPower;
      else state.localHP -= attackerPower;
      logMsg(`💥 ${attacker.card.name} conectó el golpe! Hizo ${attackerPower} de daño.`);
    } else {
      
      // --- FIX CLAVE: PROCESAR DAÑO DE MÚLTIPLES BLOQUEADORES ---
      let totalBlockerPower = 0;
      let remainingAttackerPower = attackerPower;

      blockers.forEach(blocker => {
        const bPower = getEffectivePower(blocker);
        const bToughness = getEffectiveToughness(blocker);
        
        totalBlockerPower += bPower; // Acumulamos el daño que el atacante va a recibir

        // El atacante reparte su daño. Le pega al defensor hasta matarlo, el remanente (si hay) va al siguiente.
        let damageToDeal = Math.min(remainingAttackerPower, bToughness);
        blocker.damageTaken += damageToDeal;
        remainingAttackerPower -= damageToDeal;
      });

      // El atacante se traga el daño combinado de TODOS los bloqueadores a la vez
      attacker.damageTaken += totalBlockerPower;

      // Armamos un texto dinámico para el log si son 2 o más
      const blockNames = blockers.map(b => b.card.name).join(" y ");
      logMsg(`⚔️ Choque: ${attacker.card.name} se enfrenta a ${blockNames}.`);
      // ----------------------------------------------------------
      
    }
  });

  checkDeaths(state.localCombat, state.localGraveyard, "Vos");
  checkDeaths(state.rivalCombat, state.rivalGraveyard, "El Tano");

  attackersArray.forEach(c => c.isAttacking = false);
  defendersArray.forEach(c => c.blockingIndex = null);
  state.pendingBlockerIndex = null;
}

export function checkDeaths(combatArray, graveyardArray, ownerName) {
  for (let i = combatArray.length - 1; i >= 0; i--) {
    let unit = combatArray[i];
    if (unit.damageTaken >= getEffectiveToughness(unit)) {
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
