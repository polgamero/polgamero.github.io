import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { POOL_MILESTONES, CURRENT_POOL_MILESTONE, POOL_BASELINE } from '../js/poolContract.js';
import { normalizeCounterType, getCounterDefinition, getCounterCount, listCounters } from '../js/counterEngine.js';
import { resolveReplacementEvent } from '../js/replacementEngine.js';
import { normalizeGenericTriggerSpecs, eventFilterMatches } from '../js/eventEngine.js';
import { getProliferateCandidates } from '../js/utils.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const dataDir=path.resolve(__dirname,'../assets/data');
const defs=[
  ['criaturas.json','crea_',286,297,297],
  ['instantaneos.json','inst_',121,126,126],
  ['conjuros.json','conj_',86,89,89],
  ['encantamientos.json','ench_',72,74,74],
  ['artefactos.json','art_',68,71,71],
  ['tierras.json','tier_',65,65,65],
  ['planeswalkers.json','pw_',null,null,8]
];
const byFile={};
for(const [file] of defs) byFile[file]=JSON.parse(fs.readFileSync(path.join(dataDir,file),'utf8'));
const all=Object.values(byFile).flat();

assert.ok(['23.15.8.1','23.15.9','23.15.10','23.16.1','23.16.1.1','23.16.2','23.16.2.1','23.16.3','23.16.3.1','23.16.4','23.16.4.1','23.16.5','23.16.5.1','23.16.5.2','23.17.1','23.17.2','23.17.3','23.18.3','23.19','23.19.2','23.19.3'].includes(ENGINE_VERSION),'Pool III contract must survive later engine-only releases');
assert.ok(['mp-23.10.0','mp-23.19.0','mp-23.19.1'].includes(ENGINE_PROTOCOL_VERSION));
assert.equal(FIRESTORE_RULES_VERSION,'23.13.77');
const historical730=POOL_MILESTONES.pool_expansion_iii_730;
assert.ok(historical730,'historical 730 milestone must remain auditable');
assert.equal(historical730.total,730);
assert.deepEqual(historical730.categories,{tierras:65,artefactos:71,criaturas:297,instantaneos:126,conjuros:89,encantamientos:74,planeswalkers:8});
assert.equal(POOL_MILESTONES.pool_expansion_ii_700.total,700,'historical 700 milestone must remain auditable');
assert.ok(POOL_BASELINE.total>=730);
assert.equal(all.length,POOL_BASELINE.total);
for(const [file,category] of Object.entries({'criaturas.json':'criaturas','instantaneos.json':'instantaneos','conjuros.json':'conjuros','encantamientos.json':'encantamientos','artefactos.json':'artefactos','tierras.json':'tierras','planeswalkers.json':'planeswalkers'})) {
  assert.equal(byFile[file].length,POOL_BASELINE.categories[category],`${file} current cardinality`);
}

const added=[];
for(const [file,prefix,start,end] of defs){
  if(start==null) continue;
  const ids=new Set(byFile[file].map(c=>c.id));
  for(let n=start;n<=end;n++){
    const id=`${prefix}${String(n).padStart(3,'0')}`;
    assert.ok(ids.has(id),`missing new id ${id}`);
    added.push(byFile[file].find(c=>c.id===id));
  }
}
assert.equal(added.length,30);

const rarityCounts=added.reduce((m,c)=>(m[c.rarity]=(m[c.rarity]||0)+1,m),{});
assert.deepEqual(rarityCounts,{Common:10,Uncommon:12,Rare:7,Mythic:1});

function canonical(s=''){
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
const names=new Set();
const ids=new Set();
const imageOwners=new Map();
for(const card of all){
  assert.ok(card.id && !ids.has(card.id),`duplicate id ${card.id}`); ids.add(card.id);
  const name=canonical(card.name); assert.ok(name && !names.has(name),`duplicate normalized name ${card.name}`); names.add(name);
  if(card.image){
    if(!imageOwners.has(card.image)) imageOwners.set(card.image,[]);
    imageOwners.get(card.image).push(card.id);
  }
}
for(const card of added){
  assert.match(card.image,/^[a-z0-9_]+\.png$/);
  assert.deepEqual(imageOwners.get(card.image),[card.id],`new card reuses image ${card.image}`);
}

function walk(value, fn){
  if(Array.isArray(value)){ for(const x of value) walk(x,fn); return; }
  if(!value || typeof value!=='object') return;
  fn(value);
  for(const x of Object.values(value)) walk(x,fn);
}
const counterTypes=[];
const effectTypes=[];
const triggerEvents=[];
for(const card of added) walk(card,obj=>{
  if(typeof obj.counterType==='string') counterTypes.push(normalizeCounterType(obj.counterType));
  if(typeof obj.type==='string' && ['add_counter','remove_counter','proliferate'].includes(obj.type)) effectTypes.push(obj.type);
  if(typeof obj.event==='string' && ['counter_added','counter_removed'].includes(obj.event)) triggerEvents.push(obj.event);
});
assert.ok(counterTypes.includes('shield'));
assert.ok(counterTypes.includes('stun'));
assert.ok(counterTypes.includes('charge'));
assert.ok(counterTypes.includes('Deuda'));
assert.ok(counterTypes.includes('Aplauso'));
assert.ok(counterTypes.includes('Kilómetro'));
assert.ok(effectTypes.includes('remove_counter'));
assert.ok(effectTypes.filter(x=>x==='proliferate').length>=3);
assert.ok(triggerEvents.includes('counter_added'));
assert.ok(triggerEvents.includes('counter_removed'));
assert.ok(!counterTypes.includes('time'),'POOL III deliberately reserves Time');
assert.ok(!counterTypes.includes('lore'),'POOL III deliberately reserves Lore');

// Custom counters are first-class state/UI data, not hardcoded semantics.
const customItem={card:{id:'custom',name:'Custom',type:'Artefacto'},counters:{Deuda:2,Aplauso:1,Kilómetro:4}};
assert.equal(getCounterDefinition('Deuda').icon,'●');
assert.equal(getCounterCount(customItem,'Kilómetro'),4);
assert.deepEqual(new Set(listCounters(customItem).map(x=>x.key)),new Set(['Deuda','Aplauso','Kilómetro']));

// Generic Event Engine must match both built-in and custom counter filters.
const moratoria=added.find(c=>c.id==='crea_295');
const moratoriaItem={card:moratoria,counters:{Deuda:1}};
const removalTrigger=normalizeGenericTriggerSpecs(moratoria).find(t=>t.event==='counter_removed');
assert.ok(removalTrigger);
assert.equal(eventFilterMatches(removalTrigger.filter,{type:'counter_removed',controllerIsLocal:true,item:moratoriaItem,card:moratoria,amount:1,metadata:{counterType:'Deuda'}},{sourceIsLocal:true,sourceItem:moratoriaItem,sourceCard:moratoria}),true);
assert.equal(eventFilterMatches(removalTrigger.filter,{type:'counter_removed',controllerIsLocal:true,item:moratoriaItem,card:moratoria,amount:1,metadata:{counterType:'charge'}},{sourceIsLocal:true,sourceItem:moratoriaItem,sourceCard:moratoria}),false);

// Real replacement cards double the intended additions.
const sala=added.find(c=>c.id==='ench_072');
const jefa=added.find(c=>c.id==='crea_297');
const tablero=added.find(c=>c.id==='art_071');
const ownCreature={card:{id:'own-creature',name:'C',type:'Criatura'},counters:{}};
let state={activeEffects:[],localCombat:[ownCreature],rivalCombat:[],localSupport:[{card:sala}],rivalSupport:[],localLands:[],rivalLands:[],localPlaneswalkers:[],rivalPlaneswalkers:[]};
let res=resolveReplacementEvent(state,{type:'counter_add',amount:1,counterType:'shield',metadata:{counterType:'shield'},item:ownCreature,targetItem:ownCreature,card:ownCreature.card,targetCard:ownCreature.card,targetIsLocal:true,affectedIsLocal:true});
assert.equal(res.event.amount,2);
const rivalCreature={card:{id:'rival-creature',name:'R',type:'Criatura'},counters:{}};
state={activeEffects:[],localCombat:[{card:jefa}],rivalCombat:[rivalCreature],localSupport:[],rivalSupport:[],localLands:[],rivalLands:[],localPlaneswalkers:[],rivalPlaneswalkers:[]};
res=resolveReplacementEvent(state,{type:'counter_add',amount:1,counterType:'stun',metadata:{counterType:'stun'},item:rivalCreature,targetItem:rivalCreature,card:rivalCreature.card,targetCard:rivalCreature.card,targetIsLocal:false,affectedIsLocal:false});
assert.equal(res.event.amount,2);
const ownArtifact={card:{id:'own-artifact',name:'A',type:'Artefacto'},counters:{charge:1}};
state={activeEffects:[],localCombat:[],rivalCombat:[],localSupport:[{card:tablero},ownArtifact],rivalSupport:[],localLands:[],rivalLands:[],localPlaneswalkers:[],rivalPlaneswalkers:[]};
res=resolveReplacementEvent(state,{type:'counter_add',amount:2,counterType:'charge',metadata:{counterType:'charge'},item:ownArtifact,targetItem:ownArtifact,card:ownArtifact.card,targetCard:ownArtifact.card,targetIsLocal:true,affectedIsLocal:true});
assert.equal(res.event.amount,4);

// Shield natural consumption must expose enough data for the runtime to emit counter_removed.
const shielded={card:{id:'shielded',name:'Escudado',type:'Criatura'},counters:{shield:1}};
state={activeEffects:[],localCombat:[shielded],rivalCombat:[],localSupport:[],rivalSupport:[],localLands:[],rivalLands:[],localPlaneswalkers:[],rivalPlaneswalkers:[]};
res=resolveReplacementEvent(state,{type:'damage',amount:3,item:shielded,targetItem:shielded,card:shielded.card,targetCard:shielded.card,targetIsLocal:true,affectedIsLocal:true});
assert.equal(res.prevented,true);
assert.equal(getCounterCount(shielded,'shield'),0);
assert.deepEqual(res.event.counterRemovedByReplacement,{counterType:'shield',amount:1,cause:'shield_damage_replacement'});

// Proliferate sees all new built-in/custom permanent counters at the same layer.
const proliferateState={localCombat:[{card:{id:'p1',type:'Criatura'},counters:{shield:1,stun:1}}],rivalCombat:[],localSupport:[{card:{id:'p2',type:'Artefacto'},counters:{charge:2,Deuda:1}}],rivalSupport:[],localLands:[],rivalLands:[],localPlaneswalkers:[],rivalPlaneswalkers:[],localPoison:0,rivalPoison:0};
const candidates=getProliferateCandidates(proliferateState);
assert.ok(candidates.some(x=>x.counterTypes?.includes('shield') && x.counterTypes?.includes('stun')));
assert.ok(candidates.some(x=>x.counterTypes?.includes('charge') && x.counterTypes?.includes('Deuda')));

const main=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
const stack=fs.readFileSync(new URL('../js/stackManager.js',import.meta.url),'utf8');
const combat=fs.readFileSync(new URL('../js/combatRules.js',import.meta.url),'utf8');
const replacement=fs.readFileSync(new URL('../js/replacementEngine.js',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../../.github/workflows/pages.yml',import.meta.url),'utf8');
assert.match(main,/export function dispatchReplacementCounterRemoval/);
assert.match(stack,/dispatchReplacementCounterRemoval\(result,targetItem/);
assert.match(combat,/dispatchReplacementCounterRemoval\(replacement,targetItem/);
assert.match(replacement,/counterRemovedByReplacement/);
assert.ok(fs.readFileSync(path.join(__dirname,'ci_regression_manifest_23_17_3_1.txt'),'utf8').includes('test_pool_expansion_iii_counters_23_15_8_1.mjs'));

console.log('PASS test_pool_expansion_iii_counters_23_15_8_1 pool=730 new=30 C10/U12/R7/M1 shield+stun+charge+custom+proliferate');
