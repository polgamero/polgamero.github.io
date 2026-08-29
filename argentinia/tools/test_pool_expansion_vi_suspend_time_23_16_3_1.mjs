import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { CURRENT_POOL_MILESTONE, POOL_BASELINE, POOL_MILESTONES } from '../js/poolContract.js';
import { SUSPEND_ENGINE_VERSION, hasSuspend, normalizeSuspendSpec } from '../js/suspendEngine.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const files=['criaturas.json','instantaneos.json','conjuros.json','encantamientos.json','artefactos.json','tierras.json','planeswalkers.json'];
const collect=(v,out=[])=>{ if(Array.isArray(v)) v.forEach(x=>collect(x,out)); else if(v&&typeof v==='object'){ if(v.id&&v.name&&v.type) out.push(v); else Object.values(v).forEach(x=>collect(x,out)); } return out; };
const byFile=Object.fromEntries(files.map(f=>[f,collect(json(`assets/data/${f}`))]));
const cards=Object.values(byFile).flat();
const byId=new Map(cards.map(c=>[c.id,c]));

assert.ok(['23.16.4','23.16.4.1','23.16.5','23.16.5.1','23.16.5.2','23.17.1','23.17.2','23.17.3','23.18.3','23.19','23.19.2','23.19.4.2'].includes(ENGINE_VERSION));
assert.equal(SUSPEND_ENGINE_VERSION,'23.16.3');
assert.ok(['mp-23.10.0','mp-23.19.0','mp-23.19.1'].includes(ENGINE_PROTOCOL_VERSION));
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.ok(['pool_expansion_vi_820','pool_expansion_vii_850','pool_expansion_viii_880'].includes(CURRENT_POOL_MILESTONE));
assert.ok(POOL_BASELINE.total>=820);
assert.equal(POOL_MILESTONES.pool_expansion_v_790.total,790);
assert.equal(POOL_MILESTONES.pool_expansion_vi_820.total,820);
const historicalCategories={criaturas:321,instantaneos:140,conjuros:102,encantamientos:101,artefactos:81,tierras:67,planeswalkers:8};
for (const [key,min] of Object.entries(historicalCategories)) {
  const fileKey={criaturas:'criaturas.json',instantaneos:'instantaneos.json',conjuros:'conjuros.json',encantamientos:'encantamientos.json',artefactos:'artefactos.json',tierras:'tierras.json',planeswalkers:'planeswalkers.json'}[key];
  assert.ok(byFile[fileKey].length>=min,`${key} must preserve Pool VI cardinality`);
}
assert.ok(cards.length>=820);

const ranges={crea:[312,321],inst:[135,140],conj:[98,102],ench:[98,101],art:[78,81],tier:[67,67]};
const newCards=[];
for(const [prefix,[a,b]] of Object.entries(ranges)) for(let n=a;n<=b;n++){
  const id=`${prefix}_${String(n).padStart(3,'0')}`;
  assert.ok(byId.has(id),`missing ${id}`); newCards.push(byId.get(id));
}
assert.equal(newCards.length,30);
const rarity=newCards.reduce((m,c)=>(m[c.rarity]=(m[c.rarity]||0)+1,m),{});
assert.deepEqual(rarity,{Common:10,Uncommon:12,Rare:7,Mythic:1});

const normName=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);
assert.equal(new Set(cards.map(c=>normName(c.name))).size,cards.length);
assert.equal(new Set(newCards.map(c=>c.image)).size,30);
for(const c of newCards) assert.ok(c.image?.endsWith('.png'));

const suspended=newCards.filter(hasSuspend);
assert.equal(suspended.length,14,'Pool VI must debut a broad Suspend package');
assert.ok(suspended.some(c=>String(c.type).includes('Criatura')));
assert.ok(suspended.some(c=>String(c.type).includes('Instantáneo')));
assert.ok(suspended.some(c=>String(c.type).includes('Conjuro')));
for(const c of suspended){ const spec=normalizeSuspendSpec(c); assert.ok(spec.time>=1); assert.ok(spec.cost); }
assert.ok(suspended.some(c=>normalizeSuspendSpec(c).time===4),'must exercise longer Suspend');

function effects(v,out=[]){
  if(Array.isArray(v)) v.forEach(x=>effects(x,out));
  else if(v&&typeof v==='object'){
    if(['add_time_counter_suspended','remove_time_counter_suspended'].includes(v.type)) out.push(v);
    Object.values(v).forEach(x=>effects(x,out));
  }
  return out;
}
const timeEffects=effects(newCards,[]);
assert.ok(timeEffects.filter(e=>e.type==='remove_time_counter_suspended').length>=7);
assert.ok(timeEffects.filter(e=>e.type==='add_time_counter_suspended').length>=4);
assert.ok(timeEffects.some(e=>e.owner==='self'));
assert.ok(timeEffects.some(e=>e.owner==='opponent'));
assert.ok(timeEffects.some(e=>e.owner==='any'));
assert.ok(timeEffects.some(e=>Number(e.amount)>=2));

const triggers=newCards.flatMap(c=>c.triggers||[]);
assert.ok(triggers.some(t=>t.event==='counter_removed' && t.filter?.counterType==='time' && t.filter?.metadata?.suspended===true));
assert.ok(triggers.some(t=>t.event==='counter_removed' && t.filter?.metadata?.lastRemoved===true));
assert.ok(triggers.some(t=>t.event==='counter_added' && t.filter?.counterType==='time'));
assert.ok(triggers.some(t=>t.event==='upkeep_started' && t.effect?.type==='remove_time_counter_suspended'));

const mythic=byId.get('art_081');
assert.equal(mythic.name,'Reloj Monumental de Retiro');
assert.equal(mythic.rarity,'Mythic');
assert.equal(mythic.activatedAbility.effect.type,'remove_time_counter_suspended');
assert.equal(mythic.activatedAbility.effect.amount,2);
assert.ok(mythic.triggers.some(t=>t.filter?.metadata?.lastRemoved===true && t.effect?.type==='draw' && t.effect?.amount===2));

const main=read('js/main.js');
assert.ok(main.includes("lastRemoved:transition.lastRemoved===true"));
assert.ok(main.includes("dispatchSuspendedCounterEvent('counter_removed',entry,result.removed,'suspend_upkeep',result)"));
assert.ok(main.includes("dispatchSuspendedCounterEvent('counter_added',entry,result.added,'time_counter_effect',result)"));

// Proliferate remains battlefield/player-only; Pool VI manipulates suspended Time explicitly.
const serialized=JSON.stringify(newCards).toLowerCase();
assert.equal(serialized.includes('"type":"proliferate"'),false);
assert.equal(serialized.includes('readahead'),false);

const tokenEffects=[];
const scanTokens=v=>{ if(Array.isArray(v)) return v.forEach(scanTokens); if(!v||typeof v!=='object') return; if(v.type==='create_tokens') tokenEffects.push(v); Object.values(v).forEach(scanTokens); };
newCards.forEach(scanTokens);
assert.equal(tokenEffects.length,1);
assert.equal(tokenEffects[0].tokenName,'Vecino');
assert.equal(tokenEffects[0].image,'token_vecino.png');

const workflow=read('../.github/workflows/pages.yml');
assert.ok(workflow.includes('regression_legacy_23_17_3_1.zip'));
assert.ok(workflow.includes('ci_regression_manifest_23_17_3_1.txt'));
assert.ok(workflow.includes('test_prebuilt_decks_store_23_17_3.mjs'));
assert.ok(fs.readFileSync(path.join(__dirname,'ci_regression_manifest_23_17_3_1.txt'),'utf8').includes('test_suspend_engine_23_16_3.mjs'));

console.log(`PASS test_pool_expansion_vi_suspend_time_23_16_3_1.mjs · Pool 820 · +30 · Suspend=${suspended.length} · Time effects=${timeEffects.length} · C10 U12 R7 M1`);
