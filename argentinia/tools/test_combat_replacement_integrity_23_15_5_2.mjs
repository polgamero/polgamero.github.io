import assert from 'node:assert/strict';
import fs from 'node:fs';

const combat=fs.readFileSync(new URL('../js/combatRules.js',import.meta.url),'utf8');
const version=fs.readFileSync(new URL('../js/version.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

// La integración 23.15.5 de Replacement/Prevention debe devolver el daño REALMENTE
// hecho. Lifelink, Deathtouch y triggers de daño no pueden usar la cantidad pre-prevención.
assert.ok(combat.includes('function dealCombatDamageToCreature(source, targetItem, amount)'));
assert.ok(combat.includes('return finalAmount;'),'los helpers de daño deben devolver el daño final post-replacement');
assert.ok(combat.includes('const blockerDamageDealt = dealCombatDamageToCreature(blocker, attacker, bPower)'));
assert.ok(combat.includes('blockerHasLifelink && blockerDamageDealt > 0'));
assert.ok(combat.includes('blockerHasDeathtouch && blockerDamageDealt > 0'));
assert.ok(combat.includes('const actualDamage = dealCombatDamageToCreature(attacker, blocker, damageToDeal)'));
assert.ok(combat.includes('attackerLifelinkHeal += actualDamage'));
assert.ok(combat.includes('attackerHasDeathtouch && actualDamage > 0'));

// Daño al jugador: combatDamageTrigger/Lifelink deben usar daño post-prevención.
assert.ok(combat.includes('const damageDealt = dealCombatDamageToPlayer(attacker, !isLocalAttacking, attackerPower)'));
assert.ok(combat.includes('damageToPlayerThisStep += damageDealt'));
assert.ok(!combat.includes('damageToPlayerThisStep += attackerPower'),'no se puede disparar daño-al-jugador usando daño prevenido');

// Planeswalkers también pasan por el Replacement Engine en los cuatro caminos de combate.
assert.ok(combat.includes('function dealCombatDamageToPlaneswalker(source, targetItem, amount)'));
assert.ok(combat.includes("resolveReplacementEvent(state,{type:'damage',amount"));
assert.equal((combat.match(/dealCombatDamageToPlaneswalker\(attacker, attacker\.attackTarget/g)||[]).length,4,
  'sin bloqueo, trample sin blockers, trample manual y trample auto deben usar el mismo helper');
assert.ok(!combat.includes('attacker.attackTarget.loyalty -='),'combatRules no debe restar lealtad salteando replacements');
assert.ok(combat.includes("type:'combat_damage_dealt'"),'daño de combate a permanentes debe publicar el evento final');

// Baseline de la auditoría externa: los fixes previos siguen presentes.
assert.ok(combat.includes('pendingCombatDamageContinuation'),'First/Double Strike conserva continuación entre subpasos');
assert.ok(combat.includes('wasBlockedThisCombat'),'un atacante sigue considerado bloqueado aunque mueran blockers');

if (!(version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.4.4'")))) assert.match(version,/ENGINE_VERSION = '23\.15\.(?:5\.[2-9][0-9]*|[6-9]|[1-9][0-9]+)(?:\.\d+)?'|ENGINE_VERSION = '23\.16\.1(?:\.1)?'|ENGINE_VERSION = '23\.16\.(?:2(?:\.1)?|3(?:\.1)?|4(?:\.1)?|5(?:\.[12])?)'/);
assert.match(index,/const VERSION = '23\.15\.(?:5\.[2-9][0-9]*|[6-9]|[1-9][0-9]+)(?:\.\d+)?'/);
console.log('PASS test_combat_replacement_integrity_23_15_5_2');
