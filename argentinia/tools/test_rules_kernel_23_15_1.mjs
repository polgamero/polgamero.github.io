import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isLegendaryPermanentCard,
  collectLegendGroups,
  collectCreatureStateActions,
  collectPlaneswalkerStateActions,
  collectCounterCancellationActions,
  collectTokenCeaseActions,
  evaluateStateBasedActions,
  SBA_MAX_PASSES
} from '../js/rulesKernel.js';
import {
  buildApnapTriggerGroups,
  stackPlacementFromResolutionOrders,
  triggerBatchNeedsHumanOrder
} from '../js/triggerOrdering.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const main = fs.readFileSync(path.join(root,'js','main.js'),'utf8');
const combat = fs.readFileSync(path.join(root,'js','combatRules.js'),'utf8');
const stack = fs.readFileSync(path.join(root,'js','stackManager.js'),'utf8');
const ui = fs.readFileSync(path.join(root,'js','ui.js'),'utf8');
const texts = fs.readFileSync(path.join(root,'js','gameTexts.js'),'utf8');
const version = fs.readFileSync(path.join(root,'js','version.js'),'utf8');
const priority = fs.readFileSync(path.join(root,'js','priorityUX.js'),'utf8');
const recovery = fs.readFileSync(path.join(root,'js','soloRecovery.js'),'utf8');
const turnManager = fs.readFileSync(path.join(root,'js','turnManager.js'),'utf8');
const workflow = fs.readFileSync(path.join(root,'..','.github','workflows','pages.yml'),'utf8');

function blankState() {
  return {
    localCombat:[], rivalCombat:[], localSupport:[], rivalSupport:[], localLands:[], rivalLands:[],
    localPlaneswalkers:[], rivalPlaneswalkers:[], localGraveyard:[], rivalGraveyard:[],
    localExile:[], rivalExile:[], localHand:[], rivalHand:[], localDeck:[], rivalDeck:[]
  };
}
function unit(name,{toughness=2,damage=0,deathtouch=false,indestructible=false,legendary=false}={}) {
  return { card:{ id:name, name, type:`Criatura${legendary?' Legendaria':''}`, toughness, keywords:indestructible?['indestructible']:[] }, damageTaken:damage, tookDeathtouch:deathtouch, counters:{plusOne:0,minusOne:0} };
}
const hasKeyword=(item,key)=>(item.card?.keywords||[]).includes(key);
const getToughness=item=>Number(item.card?.toughness||0)+(Number(item.counters?.plusOne||0)-Number(item.counters?.minusOne||0));

assert.equal(SBA_MAX_PASSES,32);
assert.equal(isLegendaryPermanentCard({type:'Criatura Legendaria — Humano'}),true);
assert.equal(isLegendaryPermanentCard({type:'Planeswalker',text:'Planeswalker Legendario.'}),true);
assert.equal(isLegendaryPermanentCard({type:'Criatura — Humano'}),false);
assert.ok(version.includes("ENGINE_VERSION = '23.18'") || (()=>{ try { if (!version.includes("ENGINE_VERSION = '23.18'")) return /ENGINE_VERSION = '23\.(?:15|16|17)\.(?:[1-9]|[1-9][0-9]+)(?:\.\d+)?'/.test(version); } catch { return false; } })());

// Legend rule must span every permanent zone controlled by the same player, not only creatures.
{
  const s=blankState();
  const a=unit('La Misma',{legendary:true});
  const b={card:{id:'landx',name:'La Misma',type:'Tierra Legendaria'}};
  s.localCombat.push(a); s.localLands.push(b);
  const groups=collectLegendGroups(s);
  assert.equal(groups.length,1);
  assert.equal(groups[0].entries.length,2);
  assert.equal(groups[0].isLocal,true);
}

// 704.5f/g/h: zero toughness ignores indestructible; lethal/deathtouch do not.
{
  const s=blankState();
  const zero=unit('Cero',{toughness:0,indestructible:true});
  const lethal=unit('Letal',{toughness:2,damage:2});
  const touch=unit('Toque',{toughness:9,damage:1,deathtouch:true});
  const safeInd=unit('Indestructible',{toughness:2,damage:99,indestructible:true});
  s.localCombat.push(zero,lethal,touch,safeInd);
  const actions=collectCreatureStateActions(s,{getEffectiveToughness:getToughness,hasKeyword});
  assert.deepEqual(actions.map(a=>a.reason).sort(),['deathtouch','lethal_damage','zero_toughness']);
  assert.ok(!actions.some(a=>a.item===safeInd));
}

// 704.5i / current PW rule implemented by the project.
{
  const s=blankState();
  s.localPlaneswalkers.push({card:{name:'PW',type:'Planeswalker',text:'Planeswalker Legendario.'},loyalty:0});
  assert.equal(collectPlaneswalkerStateActions(s).length,1);
}

// 704.5q: opposing P/T counters are detected as an SBA, not erased by addCounters().
{
  const s=blankState(); const u=unit('Contadores');
  u.counters={plusOne:3,minusOne:2}; s.localCombat.push(u);
  const land={card:{name:'Tierra con contadores',type:'Tierra'},counters:{plusOne:1,minusOne:1}};
  s.localLands.push(land);
  const a=collectCounterCancellationActions(s);
  assert.equal(a.length,2);
  assert.equal(a.find(x=>x.item===u).amount,2);
  assert.equal(a.find(x=>x.item===land).amount,1);
}

// 704.5d: legacy/recovery token outside battlefield must cease to exist.
{
  const s=blankState();
  s.localGraveyard.push({name:'Ficha Vecino',isToken:true});
  s.localExile.push({name:'Ficha Espíritu',isToken:true});
  assert.equal(collectTokenCeaseActions(s).length,2);
}

// Snapshot combines all mechanical SBA classes.
{
  const s=blankState();
  const u=unit('Duplicada',{legendary:true,toughness:0});
  const u2=unit('Duplicada',{legendary:true});
  s.localCombat.push(u,u2);
  s.rivalPlaneswalkers.push({card:{name:'Rival PW',type:'Planeswalker',text:'Planeswalker Legendario.'},loyalty:0});
  const snap=evaluateStateBasedActions(s,{getEffectiveToughness:getToughness,hasKeyword});
  assert.equal(snap.legends.length,1);
  assert.equal(snap.creatures.length,1);
  assert.equal(snap.planeswalkers.length,1);
}

// CR 603.3b: AP/NAP + orden elegido por cada controlador sobre una Stack LIFO.
{
  const A1={id:'A1',isLocal:true}, A2={id:'A2',isLocal:true};
  const N1={id:'N1',isLocal:false}, N2={id:'N2',isLocal:false};
  const groups=buildApnapTriggerGroups([A1,N1,A2,N2],true);
  assert.deepEqual(groups.active.map(x=>x.id),['A1','A2']);
  assert.deepEqual(groups.nonActive.map(x=>x.id),['N1','N2']);
  assert.equal(triggerBatchNeedsHumanOrder([A1,A2],true,{multiplayer:false}),true);
  assert.equal(triggerBatchNeedsHumanOrder([N1,N2],true,{multiplayer:false}),false,'En Solo el Tano no abre modal.');
  assert.equal(triggerBatchNeedsHumanOrder([N1,N2],true,{multiplayer:true}),true,'En multiplayer el rival humano ordena sus triggers.');
  const placement=stackPlacementFromResolutionOrders([A2,A1],[N1,N2]);
  assert.deepEqual(placement.map(x=>x.id),['A1','A2','N2','N1']);
  assert.deepEqual([...placement].reverse().map(x=>x.id),['N1','N2','A2','A1'],'NAP resuelve antes por estar arriba de la Stack; cada grupo conserva el orden elegido.');
}

// Integration contract: no three hard-coded "new copy dies" legend implementations remain.
assert.ok(main.includes('export async function runStateBasedActions'));
assert.ok(main.includes('sbaLegendChoiceMemory'));
assert.ok(main.includes("runStateBasedActions({ reason:'legacy_planeswalker_deaths' })"));
assert.ok(combat.includes("runStateBasedActions({ reason:'legacy_check_all_deaths' })"));
assert.ok(stack.includes("runStateBasedActions({ reason:'stack_item_resolved' })"));
assert.ok(stack.includes('await waitForStateBasedActions()'));
assert.ok(!stack.includes("gameText('legend.reanimatedDuplicate'"));
assert.ok(!stack.includes("gameText('legend.newDuplicate'"));
assert.ok(!main.includes("gameText('legend.returnedDuplicate'"));

// Trigger barrier + UI choice are part of the kernel contract.
assert.ok(main.includes('sbaHeldTriggerBatches'));
assert.ok(main.includes('applyLocalLegendChoiceForMultiplayer'));
assert.ok(main.includes("requestRivalDecision('trigger_order'"));
assert.ok(main.includes('waitForTriggerOrdering'));
assert.ok(main.includes('triggerLandEtbBatch'));
assert.ok(main.includes('triggerCreatureEtbBatch'));
assert.ok(!combat.includes('function unitDiesToStateBasedDamage'));
assert.ok(!combat.includes('function removeDeadCombatUnit'));
assert.ok(priority.includes('pendingLegendChoice') && priority.includes('pendingTriggerOrderChoice'));
assert.ok(recovery.includes('pendingLegendChoice') && recovery.includes('pendingTriggerOrderChoice'));
assert.ok(turnManager.includes('pendingLegendChoice') && turnManager.includes('pendingTriggerOrderChoice'));
const compactCiManifest = fs.readFileSync(path.join(root,'tools','ci_regression_manifest_23_17_3_1.txt'),'utf8');
assert.ok(workflow.includes('ci_regression_manifest_23_17_3_1.txt'));
assert.ok(compactCiManifest.includes('test_rules_kernel_23_15_1.mjs'));
assert.ok(main.includes('flushSbaHeldTriggers'));
assert.ok(main.includes('hasStateBasedActionsToProcess'));
assert.ok(ui.includes('showLegendRuleChoiceModal'));
for (const key of ['sba.legend.title','sba.legend.subtitle','sba.legend.confirm','sba.legend.moved','sba.counterCancel','sba.tokenCeases','trigger.order.title','trigger.order.subtitle','trigger.order.confirm']) {
  assert.ok(texts.includes(`'${key}'`), `Falta Game Text ${key}`);
}

// Historical 23.15.1 snapshot was engine-only at pool 643; cumulative releases may append cards.
const files=['tierras','artefactos','criaturas','instantaneos','conjuros','encantamientos','planeswalkers'];
const total=files.reduce((n,name)=>n+JSON.parse(fs.readFileSync(path.join(root,'assets','data',`${name}.json`),'utf8')).length,0);
assert.ok(total>=643,'cumulative source must preserve at least the historical 643-card pool');

console.log('RULES_KERNEL_23_15_1_OK sba=repeat+simultaneous legend=choose-one+multiplayer-safe triggers=held+APNAP+controller-order counters=SBA tokens=cease historical-pool>=643');
