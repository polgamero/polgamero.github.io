import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyConvokeToCost } from '../js/costEngine.js';
import { canPoolPayCost, spendCostAutomatically } from '../js/manaPool.js';
import { collectAttachmentStateActions } from '../js/rulesKernel.js';
import { GAME_EVENT_TYPES } from '../js/eventEngine.js';

const mk=(name,colors)=>({card:{name,colors,type:'Criatura'}});
const conv=applyConvokeToCost({W:1,U:0,B:1,R:1,G:0,C:0,generic:0},[
  mk('BW',['B','W']),mk('GR',['G','R']),mk('UW',['U','W'])
]);
assert.equal(conv.cost.W,0); assert.equal(conv.cost.B,0); assert.equal(conv.cost.R,0,'Convoke debe encontrar matching máximo y no dejar un pip coloreado pagable');
assert.equal(conv.usedItems.length,3);

const pool={W:1,U:1,B:1,R:1,G:0,C:0};
const hybridCost={W:0,U:0,B:0,R:0,G:0,C:0,generic:0,hybrid:[['G','B'],['R','U'],['R','G']]};
assert.equal(canPoolPayCost(pool,hybridCost),true);
assert.equal(spendCostAutomatically(pool,hybridCost),true,'pago automático debe compartir planner con canPoolPayCost');
assert.deepEqual(pool,{W:1,U:0,B:0,R:0,G:0,C:0});

const failPool={W:1,U:0,B:0,R:0,G:0,C:0};
const failCost={W:0,U:0,B:1,R:0,G:0,C:0,generic:0,hybrid:[['W','U']]};
const beforePool=structuredClone(failPool), beforeCost=structuredClone(failCost);
assert.equal(spendCostAutomatically(failPool,failCost),false);
assert.deepEqual(failPool,beforePool,'un fallo automático no puede consumir maná');
assert.deepEqual(failCost,beforeCost,'un fallo automático no puede consumir símbolos del coste');

const mixedPool={W:0,U:1,B:1,R:0,G:0,C:0};
const mixedCost={W:0,U:0,B:0,R:0,G:0,C:0,generic:0,hybrid:[['U','B']],phyrexian:['U']};
assert.equal(canPoolPayCost(mixedPool,mixedCost),true,'híbrido y Phyrexian deben planificarse conjuntamente');
assert.equal(spendCostAutomatically(mixedPool,mixedCost),true);

const vehicle={card:{name:'Vehículo',type:'Artefacto — Vehículo'},isVehicle:false,auras:[{name:'Aura',type:'Encantamiento — Aura',colors:['U']}]};
const equipment={card:{name:'Equipo',type:'Artefacto — Equipo',colors:[]},attachedTo:vehicle};
const attachmentState={localCombat:[],rivalCombat:[],localSupport:[vehicle,equipment],rivalSupport:[],localLands:[],rivalLands:[],localPlaneswalkers:[],rivalPlaneswalkers:[]};
const attachmentActions=collectAttachmentStateActions(attachmentState,{getProtectionMatch:()=>null});
assert.ok(attachmentActions.some(a=>a.kind==='aura'&&a.illegalTargetType),'Aura criatura debe ser ilegal cuando el Vehículo deja de ser criatura');
assert.ok(attachmentActions.some(a=>a.kind==='equipment'&&a.illegalTargetType),'Equipment debe desprenderse cuando el target deja de ser criatura');

assert.ok(GAME_EVENT_TYPES.includes('combat_started'),'Event Engine debe exponer comienzo de combate');

const stack=fs.readFileSync(new URL('../js/stackManager.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
const turn=fs.readFileSync(new URL('../js/turnManager.js',import.meta.url),'utf8');
assert.ok(stack.includes('CR 608.2b — puerta única de revalidación al resolver'));
assert.ok(stack.includes("targetObj.type !== 'stack' && !isResolvedEffectTargetLegal"),'spells normales deben revalidar target al resolver');
assert.ok(stack.includes('cardLike: card, sourceCard: card'),'Aura debe revalidar su target antes de anexarse');
assert.ok(main.includes('pendingKickerResolutionContinuation'));
assert.ok(stack.indexOf('const basePendingInteractive') < stack.indexOf("logMsg(gameText('stack.kickerBonus'"),'pending interactivo debe detectarse antes del bonus Kicker');
assert.ok(main.includes("await resolveGameEffect(pending.bonusEffect"),'Kicker diferido debe tener continuación real, no un return que lo pierda');
assert.ok(!turn.includes('Saltear combate si no hay criaturas viables'),'Comienzo de Combate no debe omitirse por falta de atacantes');
assert.ok(turn.includes("type:'combat_started'"));
assert.ok(turn.includes('detachEquipmentFrom(v, isLocalVehicle)') && turn.includes('sendAurasToGraveyard(v, isLocalVehicle)'));


// Contrato de contenido preventivo: Affinity no puede caer silenciosamente a artifact por typo.
const dataDir=new URL('../assets/data/',import.meta.url);
const allowedAffinity=new Set(['artifact','creature','land','permanent']);
for(const file of fs.readdirSync(dataDir).filter(name=>name.endsWith('.json'))){
  const raw=JSON.parse(fs.readFileSync(new URL(file,dataDir),'utf8'));
  const cards=Array.isArray(raw)?raw:Object.values(raw).flatMap(v=>Array.isArray(v)?v:[]);
  for(const card of cards){
    if(!card?.affinity || card.affinity===true) continue;
    const value=typeof card.affinity==='string'?card.affinity:(card.affinity.permanentType||card.affinity.type||'artifact');
    assert.ok(allowedAffinity.has(String(value).toLowerCase()),`${card.name}: affinity inválido ${value}`);
  }
}

console.log('PASS test_rules_integrity_hotfix_23_15_5_1');
