import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { CURRENT_POOL_MILESTONE, POOL_BASELINE, POOL_MILESTONES } from '../js/poolContract.js';
import { EXILE_PLAY_ENGINE_VERSION, normalizeExilePlayPermission } from '../js/exilePlayEngine.js';
import { GAME_EVENT_TYPES } from '../js/eventEngine.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const dataFiles=['criaturas.json','instantaneos.json','conjuros.json','encantamientos.json','artefactos.json','tierras.json','planeswalkers.json'];
function collect(value,out=[]){
  if(Array.isArray(value)) value.forEach(v=>collect(v,out));
  else if(value && typeof value==='object'){
    if(value.id && value.name && value.type) out.push(value);
    else Object.values(value).forEach(v=>collect(v,out));
  }
  return out;
}
const byFile=Object.fromEntries(dataFiles.map(f=>[f,collect(json(`assets/data/${f}`))]));
const cards=Object.values(byFile).flat();
const byId=new Map(cards.map(c=>[c.id,c]));

assert.ok(['23.16.2.1','23.16.3','23.16.3.1','23.16.4','23.16.4.1','23.16.5','23.16.5.1','23.16.5.2','23.17.1','23.17.2','23.17.3','23.18.3','23.19','23.19.2','23.19.5'].includes(ENGINE_VERSION));
assert.equal(EXILE_PLAY_ENGINE_VERSION,'23.16.2');
assert.ok(['mp-23.10.0','mp-23.19.0','mp-23.19.2'].includes(ENGINE_PROTOCOL_VERSION));
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.ok(['pool_expansion_v_790','pool_expansion_vi_820','pool_expansion_vii_850','pool_expansion_viii_880'].includes(CURRENT_POOL_MILESTONE));
assert.ok(POOL_BASELINE.total>=790);
assert.equal(POOL_MILESTONES.pool_expansion_iv_760.total,760);
assert.equal(POOL_MILESTONES.pool_expansion_v_790.total,790);
assert.ok(byFile['criaturas.json'].length>=311);
assert.ok(byFile['instantaneos.json'].length>=134);
assert.ok(byFile['conjuros.json'].length>=97);
assert.ok(byFile['encantamientos.json'].length>=97);
assert.ok(byFile['artefactos.json'].length>=77);
assert.ok(byFile['tierras.json'].length>=66);
assert.ok(byFile['planeswalkers.json'].length>=8);
assert.ok(cards.length>=790);

const newRanges={crea:[303,311],inst:[129,134],conj:[92,97],ench:[94,97],art:[74,77],tier:[66,66]};
const newCards=[];
for(const [prefix,[a,b]] of Object.entries(newRanges)){
  for(let n=a;n<=b;n++){
    const id=`${prefix}_${String(n).padStart(3,'0')}`;
    assert.ok(byId.has(id),`missing ${id}`);
    newCards.push(byId.get(id));
  }
}
assert.equal(newCards.length,30);
const rarity=newCards.reduce((m,c)=>(m[c.rarity]=(m[c.rarity]||0)+1,m),{});
assert.deepEqual(rarity,{Common:10,Uncommon:12,Rare:7,Mythic:1});

const normName=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
assert.equal(new Set(cards.map(c=>c.id)).size,cards.length,'all card ids unique');
assert.equal(new Set(cards.map(c=>normName(c.name))).size,cards.length,'normalized card names unique');
assert.equal(new Set(newCards.map(c=>c.image)).size,30,'all Pool V images unique');
for(const c of newCards) assert.ok(c.image?.endsWith('.png'),`${c.id} missing PNG filename`);

function scan(v,out=[]){
  if(Array.isArray(v)) v.forEach(x=>scan(x,out));
  else if(v&&typeof v==='object'){
    if(v.type==='exile_top_with_permission') out.push(v);
    Object.values(v).forEach(x=>scan(x,out));
  }
  return out;
}
const exileEffects=scan(newCards,[]);
assert.ok(exileEffects.length>=15,`expected broad exile content, got ${exileEffects.length}`);
for(const e of exileEffects){
  assert.ok(Number(e.amount)>=1);
  const p=normalizeExilePlayPermission(e.permission||e.playPermission||{});
  assert.ok(['until_end_of_turn','until_end_of_next_turn','while_exiled'].includes(p.duration));
}
assert.ok(exileEffects.some(e=>(e.owner||'self')==='opponent'),'must exercise opponent-library exile');
assert.ok(exileEffects.some(e=>normalizeExilePlayPermission(e.permission||{}).timing==='any_time'),'must exercise any-time casting');
assert.ok(exileEffects.some(e=>normalizeExilePlayPermission(e.permission||{}).costMode==='custom'),'must exercise custom exile cost');
assert.ok(exileEffects.some(e=>normalizeExilePlayPermission(e.permission||{}).costMode==='without_paying_mana_cost'),'must exercise free exile casting');
assert.ok(exileEffects.some(e=>Number(e.amount)>=3),'must exercise multi-card permission grant');

const triggers=newCards.flatMap(c=>c.triggers||[]);
assert.ok(triggers.some(t=>t.event==='cast_from_exile' && t.filter?.controller==='you'));
assert.ok(triggers.some(t=>t.event==='cast_from_exile' && t.filter?.controller==='opponent'));
assert.ok(triggers.some(t=>t.event==='card_played_from_exile'));
assert.ok(triggers.some(t=>t.event==='card_played_from_exile' && t.effect?.type==='create_tokens'));
assert.ok(GAME_EVENT_TYPES.includes('cast_from_exile'));
assert.ok(GAME_EVENT_TYPES.includes('card_played_from_exile'));

const mythic=byId.get('art_077');
assert.equal(mythic.name,'Pasaporte de la República Invisible');
assert.equal(mythic.rarity,'Mythic');
assert.equal(mythic.activatedAbility.effect.type,'exile_top_with_permission');
assert.equal(normalizeExilePlayPermission(mythic.activatedAbility.effect.permission).costMode,'without_paying_mana_cost');
assert.equal(normalizeExilePlayPermission(mythic.activatedAbility.effect.permission).playMode,'spell');

const borrowed=byId.get('inst_133').effect;
assert.equal(borrowed.owner,'opponent');
assert.equal(borrowed.controller,'self');
assert.equal(normalizeExilePlayPermission(borrowed.permission).customCost,'{2}');
const hack=byId.get('conj_095').effect;
assert.equal(hack.owner,'opponent');
assert.equal(hack.amount,2);
assert.equal(normalizeExilePlayPermission(hack.permission).duration,'until_end_of_next_turn');

const etb=byId.get('crea_311').etbEffect;
assert.equal(etb.type,'exile_top_with_permission');
const activated=[byId.get('art_074'),byId.get('art_075'),byId.get('art_077')];
for(const c of activated) assert.equal(c.activatedAbility.effect.type,'exile_top_with_permission');

// No Suspend/Time automatic semantics or Read Ahead sneak into this content block.
const serialized=JSON.stringify(newCards).toLowerCase();
assert.equal(newCards.some(c=>c.suspend),false);
assert.equal(serialized.includes('readahead'),false);

// Token ownership stays stable: only existing Vecino is reused.
const tokenEffects=[];
function scanTokens(v){
  if(Array.isArray(v)) return v.forEach(scanTokens);
  if(!v||typeof v!=='object') return;
  if(v.type==='create_tokens') tokenEffects.push(v);
  Object.values(v).forEach(scanTokens);
}
newCards.forEach(scanTokens);
for(const e of tokenEffects){
  assert.equal(e.tokenName,'Vecino');
  assert.equal(e.image,'token_vecino.png');
}

const workflow=read('../.github/workflows/pages.yml');
assert.ok(workflow.includes('regression_legacy_23_17_3_1.zip'));
assert.ok(workflow.includes('ci_regression_manifest_23_17_3_1.txt'));
assert.ok(workflow.includes('test_prebuilt_decks_store_23_17_3.mjs'));
assert.ok(fs.readFileSync(path.join(__dirname,'ci_regression_manifest_23_17_3_1.txt'),'utf8').includes('test_cast_from_exile_engine_23_16_2.mjs'));

console.log(`PASS test_pool_expansion_v_exile_23_16_2_1.mjs · Pool 790 · +30 · exileEffects=${exileEffects.length} · cast/play payoffs + opponent library + custom/free/any-time · C10 U12 R7 M1`);
