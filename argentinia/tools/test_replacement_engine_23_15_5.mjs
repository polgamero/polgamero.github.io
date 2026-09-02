import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveReplacementEvent, collectReplacementEffects, replacementEngineSummary } from '../js/replacementEngine.js';

const emptyState=()=>({localCombat:[],localSupport:[],localLands:[],localPlaneswalkers:[],rivalCombat:[],rivalSupport:[],rivalLands:[],rivalPlaneswalkers:[],localGraveyard:[],rivalGraveyard:[],localExile:[],rivalExile:[],activeEffects:[]});
const perm=(name,type='Encantamiento',extra={})=>({card:{id:name,name,type,...extra},tapped:false,_syncObjectId:`obj_${name}`});

// Rest in Peace-style: la acción ocurre, pero el destino cementerio cambia a exilio.
{
  const s=emptyState();
  s.localSupport.push(perm('Rip','Encantamiento',{replacementEffect:{event:'zone_change_to_graveyard',scope:'all',action:'redirect_zone',replaceZoneTo:'exile'}}));
  const victim=perm('Victim','Criatura — Humano');
  const r=resolveReplacementEvent(s,{type:'zone_change',zoneFrom:'battlefield',zoneTo:'graveyard',affectedIsLocal:false,card:victim.card,item:victim,cause:'destroy'});
  assert.equal(r.event.zoneTo,'exile'); assert.equal(r.changed,true);
}

// Doubling Season / Parallel Lives primitives share multiplyAmount.
{
  const s=emptyState();
  s.localSupport.push(perm('Tokens','Encantamiento',{replacementEffect:{event:'token_create',scope:'own',multiplyAmount:2}}));
  let r=resolveReplacementEvent(s,{type:'token_create',amount:3,affectedIsLocal:true});
  assert.equal(r.event.amount,6);
  s.localSupport.push(perm('Counters','Encantamiento',{replacementEffect:{event:'counter_add',scope:'own',multiplyAmount:2}}));
  r=resolveReplacementEvent(s,{type:'counter_add',amount:2,affectedIsLocal:true,counterType:'plusOne',card:{name:'Bicho',type:'Criatura'}});
  assert.equal(r.event.amount,4);
}

// Prevention shield temporal consume exactamente lo prevenido.
{
  const s=emptyState(); s.activeEffects.push({id:7,effectType:'prevent_damage',targetPlayer:'local',remaining:3});
  const r=resolveReplacementEvent(s,{type:'damage',amount:5,targetIsLocal:true,affectedIsLocal:true});
  assert.equal(r.event.amount,2); assert.equal(r.event.preventedAmount,3); assert.equal(s.activeEffects.length,0);
}

// Shield counter: previene damage o destroy y consume uno.
{
  const s=emptyState(); const victim=perm('Shielded','Criatura — Soldado'); victim.counters={shield:2}; s.localCombat.push(victim);
  let r=resolveReplacementEvent(s,{type:'damage',amount:9,targetIsLocal:true,affectedIsLocal:true,item:victim,card:victim.card});
  assert.equal(r.event.amount,0); assert.equal(r.prevented,true); assert.equal(victim.counters.shield,1);
  r=resolveReplacementEvent(s,{type:'destroy',targetIsLocal:true,affectedIsLocal:true,item:victim,card:victim.card,zoneTo:'graveyard'});
  assert.equal(r.prevented,true); assert.equal(victim.counters.shield,0);
}

// Dos replacements aplicables pueden ordenarse por el jugador afectado mediante hook.
{
  const s=emptyState();
  s.localSupport.push(perm('A','Encantamiento',{replacementEffect:{id:'double',event:'token_create',scope:'own',multiplyAmount:2,priority:10}}));
  s.localSupport.push(perm('B','Encantamiento',{replacementEffect:{id:'set3',event:'token_create',scope:'own',setAmount:3,priority:1}}));
  const candidates=collectReplacementEffects(s,{type:'token_create',amount:1,affectedIsLocal:true});
  assert.equal(candidates.length,2);
  const r=resolveReplacementEvent(s,{type:'token_create',amount:1,affectedIsLocal:true},{chooseReplacement:(c)=>c.find(x=>x.id==='set3')});
  // set 3 primero, double después => 6. El hook cambia el resultado respecto de double->set3 (=3).
  assert.equal(r.event.amount,6);
}

assert.deepEqual(replacementEngineSummary().events,['damage','destroy','zone_change','token_create','counter_add']);

// Contrato de integración acumulativa + pool intacto.
{
  const here=path.dirname(fileURLToPath(import.meta.url));
  const main=fs.readFileSync(path.join(here,'../js/main.js'),'utf8');
  const stack=fs.readFileSync(path.join(here,'../js/stackManager.js'),'utf8');
  const utils=fs.readFileSync(path.join(here,'../js/utils.js'),'utf8');
  const combat=fs.readFileSync(path.join(here,'../js/combatRules.js'),'utf8');
  const turn=fs.readFileSync(path.join(here,'../js/turnManager.js'),'utf8');
  const version=fs.readFileSync(path.join(here,'../js/version.js'),'utf8');
  if (!(version.includes("ENGINE_VERSION = '23.18.3'") || (version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.5.2'")))) assert.match(version,/ENGINE_VERSION = '23\.15\.(?:[5-9]|[1-9][0-9]+)(?:\.\d+)?'|ENGINE_VERSION = '23\.16\.1(?:\.1)?'|ENGINE_VERSION = '23\.16\.(?:2(?:\.1)?|3(?:\.1)?|4(?:\.1)?|5(?:\.[12])?)'/);
  assert.match(main,/resolveReplacementEvent/);
  assert.match(main,/type:'counter_add'/);
  assert.match(main,/replacementExitPlan/);
  assert.match(main,/replacementCardZonePlan\(discardedCard,victimIsLocal,'hand','graveyard'/);
  assert.match(stack,/replacementDestroyOutcome/);
  assert.match(stack,/replacementCardZoneOutcome\(c,isLocal,'library','graveyard','surveil'/);
  assert.match(stack,/moveResolvedSpellCard/);
  assert.match(utils,/type:'zone_change'.*zoneFrom:'stack'.*zoneTo:'graveyard'/s);
  assert.match(stack,/type:'token_create'/);
  assert.match(stack,/effectToApply\.type === 'prevent_damage'/);
  assert.match(combat,/resolveReplacementEvent/);
  assert.match(turn,/effect\.effectType === 'prevent_damage'/);
  assert.match(turn,/cleanupDiscardDestination/);
  assert.match(main,/cause:'aura_detached'/);
  let count=0;
  for(const file of ['criaturas.json','tierras.json','encantamientos.json','artefactos.json','instantaneos.json','planeswalkers.json','conjuros.json']){
    const d=JSON.parse(fs.readFileSync(path.join(here,'../assets/data',file),'utf8'));
    if(Array.isArray(d)) count+=d.length; else for(const v of Object.values(d)) if(Array.isArray(v)) count+=v.length;
  }
  assert.ok(count>=643,'cumulative source must preserve the historical 643-card pool from 23.15.5');
}
console.log('PASS test_replacement_engine_23_15_5');
