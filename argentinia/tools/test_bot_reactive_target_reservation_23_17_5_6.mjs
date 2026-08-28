import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BOT_TARGET_RESERVATION_VERSION,
  permanentIdentity,
  samePermanentInstance,
  botStackItemReservesCreatureTarget,
  isCreatureReservedByBotStack
} from '../js/botTargetReservation.js';

assert.equal(BOT_TARGET_RESERVATION_VERSION, '23.17.5.6');

const helpers = {
  isCounterSpell: card => String(card?.effect?.type || '').startsWith('counter'),
  hasKeyword: (item, kw) => (item?.keywords || item?.card?.keywords || []).includes(kw),
  getCounterCount: (item, type) => Number(item?.counters?.[type] || 0),
  getEffectiveToughness: item => Number(item?.effectiveToughness ?? item?.card?.toughness ?? 0)
};

const angelA = { _syncObjectId:'perm_angel_a', card:{ instanceId:'ci_119', id:'crea_050', name:'Ángel del Descampado', toughness:5 }, damageTaken:0 };
const angelClone = { _syncObjectId:'perm_angel_b', card:{ instanceId:'ci_999', id:'crea_050', name:'Ángel del Descampado', toughness:5 }, damageTaken:0 };
assert.equal(permanentIdentity(angelA), 'perm_angel_a');
assert.equal(samePermanentInstance(angelA, angelA), true);
assert.equal(samePermanentInstance(angelA, angelClone), false, 'Dos copias iguales no son la misma instancia.');

// RCA 23.17.5.6: Pacto A ya cubre al Ángel. Pacto B no debe volver a reservar la MISMA
// instancia sólo porque el jugador devolvió prioridad al Tano.
const pactoA = {
  id:12,
  isLocal:false,
  card:{ id:'inst_020', name:'Pacto Final', effect:{type:'exile_creature'} },
  effect:{type:'exile_creature'},
  targetObj:{type:'creature', isLocal:true, item:angelA}
};
const stack = [pactoA];
assert.equal(isCreatureReservedByBotStack(angelA, stack, helpers), true, 'Pacto pendiente debe reservar el Ángel objetivo.');
assert.equal(isCreatureReservedByBotStack(angelClone, stack, helpers), false, 'Otra copia física igual debe seguir disponible.');

// Si el humano contrarrestó Pacto A, una segunda respuesta sobre el mismo Ángel vuelve a
// ser razonable: la primera cobertura ya no es confiable.
const counterPactoA = {
  id:13,
  isLocal:true,
  card:{name:'Counter de prueba', effect:{type:'counter_spell'}},
  targetObj:{type:'stack', stackId:12}
};
assert.equal(isCreatureReservedByBotStack(angelA, [pactoA, counterPactoA], helpers), false,
  'Un removal propio ya contrarrestado no debe reservar el objetivo.');

// Destruir vs Shield / Indestructible: la primera respuesta no garantiza sacar la criatura,
// así que no debe bloquear una segunda respuesta potencialmente necesaria.
const destroy = {
  id:20, isLocal:false,
  card:{name:'Destroy', effect:{type:'destroy_creature'}}, effect:{type:'destroy_creature'},
  targetObj:{type:'creature',isLocal:true,item:angelA}
};
assert.equal(botStackItemReservesCreatureTarget(destroy, angelA, [destroy], helpers), true);
angelA.counters={shield:1};
assert.equal(botStackItemReservesCreatureTarget(destroy, angelA, [destroy], helpers), false, 'Shield absorbe la primera destrucción.');
angelA.counters={}; angelA.keywords=['indestructible'];
assert.equal(botStackItemReservesCreatureTarget(destroy, angelA, [destroy], helpers), false, 'Indestructible invalida la cobertura de destroy.');
angelA.keywords=[];

// Daño: sólo reserva si ya es letal con el daño marcado actual.
const burn = amount => ({
  id:30+amount, isLocal:false,
  card:{name:'Burn', effect:{type:'damage',amount}}, effect:{type:'damage',amount},
  targetObj:{type:'creature',isLocal:true,item:angelA}
});
angelA.effectiveToughness=5; angelA.damageTaken=2;
assert.equal(botStackItemReservesCreatureTarget(burn(2), angelA, [], helpers), false);
assert.equal(botStackItemReservesCreatureTarget(burn(3), angelA, [], helpers), true);
angelA.counters={shield:1};
assert.equal(botStackItemReservesCreatureTarget(burn(5), angelA, [], helpers), false);
angelA.counters={};

// Wiring: la IA reactiva debe filtrar objetivos reservados tanto al decidir si una carta de
// removal es jugable como al elegir el target; damage también excluye criatura reservada.
const botSource = fs.readFileSync(new URL('../js/bot.js', import.meta.url), 'utf8');
assert.match(botSource, /function legalReactiveRemovalTargets\(card\)/);
assert.match(botSource, /!isReservedReactiveCreatureTarget\(item\)/);
assert.match(botSource, /return legalReactiveRemovalTargets\(c\)\.length > 0;/);
assert.match(botSource, /const candidates = legalReactiveRemovalTargets\(responseCard\);/);
assert.match(botSource, /!isReservedReactiveCreatureTarget\(c\)[\s\S]*getEffectiveToughness\(c\) - \(c\.damageTaken \|\| 0\)/);

console.log('BOT_REACTIVE_TARGET_RESERVATION_23_17_5_6_OK same-instance=reserved clone=free counter=unreserved shield=unreserved indestructible=unreserved lethal-damage=reserved wiring=active');
