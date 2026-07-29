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
  if (attackers.length === 0) return;

  attackers.forEach(a => a.tapped = true);
  logMsg(`🗡️ Declaraste ${attackers.length} atacantes.`);

  let availableBlockers = state.rivalCombat.map((c, i) => ({c, i})).filter(obj => !obj.c.tapped);
  
  state.localCombat.forEach((att, aIdx) => {
    if (att.isAttacking && availableBlockers.length > 0) {
      let blockerObj = availableBlockers.pop();
      state.rivalCombat[blockerObj.i].blockingIndex = aIdx;
      logMsg(`🛡️ El Tano bloquea a tu ${att.card.name} usando su ${blockerObj.c.card.name}.`);
    }
  });

  resolveCombatDamage(state.localCombat, state.rivalCombat, true);
  render();
}

export function executeRivalAttack() {
  logMsg(`🛡️ Resolviendo combates...`);
  resolveCombatDamage(state.rivalCombat, state.localCombat, false);
  
  state.phase = 'main';
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
      let blocker = blockers[0];
      const blockerPower = getEffectivePower(blocker);
      blocker.damageTaken += attackerPower;
      attacker.damageTaken += blockerPower;
      logMsg(`⚔️ Choque: ${attacker.card.name} y ${blocker.card.name} se hacen daño mutuo.`);
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
