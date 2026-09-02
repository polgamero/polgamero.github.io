import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION } from '../js/version.js';
import { CURRENT_POOL_MILESTONE, POOL_BASELINE, POOL_MILESTONES } from '../js/poolContract.js';
import { SAGA_ENGINE_VERSION, isSagaCard, normalizeSagaSpec, sagaChaptersCrossed } from '../js/sagaEngine.js';

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

assert.ok(['23.16.1.1','23.16.2','23.16.2.1','23.16.3','23.16.3.1','23.16.4','23.16.4.1','23.16.5','23.16.5.1','23.16.5.2','23.17.1','23.17.2','23.17.3','23.18.3','23.19','23.19.2','23.19.5.2'].includes(ENGINE_VERSION),'Pool IV contract must survive later releases');
assert.equal(SAGA_ENGINE_VERSION,'23.16.1');
assert.ok(['pool_expansion_iv_760','pool_expansion_v_790','pool_expansion_vi_820','pool_expansion_vii_850','pool_expansion_viii_880'].includes(CURRENT_POOL_MILESTONE));
assert.ok(POOL_BASELINE.total>=760);
assert.equal(POOL_MILESTONES.pool_expansion_iv_760.total,760);
assert.ok(byFile['criaturas.json'].length>=302);
assert.ok(byFile['instantaneos.json'].length>=128);
assert.ok(byFile['conjuros.json'].length>=91);
assert.ok(byFile['encantamientos.json'].length>=93);
assert.ok(byFile['artefactos.json'].length>=73);
assert.ok(byFile['tierras.json'].length>=65);
assert.ok(byFile['planeswalkers.json'].length>=8);
assert.ok(cards.length>=760);

const newRanges={
  crea:[298,302],inst:[127,128],conj:[90,91],ench:[75,93],art:[72,73]
};
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
assert.equal(new Set(newCards.map(c=>c.image)).size,30,'all new images unique');
for(const c of newCards) assert.ok(c.image && c.image.endsWith('.png'),`${c.id} needs a unique PNG filename`);

const sagas=newCards.filter(isSagaCard);
const supports=newCards.filter(c=>!isSagaCard(c));
assert.equal(sagas.length,18);
assert.equal(supports.length,12);
for(const c of sagas){
  const spec=normalizeSagaSpec(c);
  assert.ok(spec.valid,`${c.id} invalid Saga spec`);
  assert.ok(spec.finalChapter>=3,`${c.id} needs >=3 chapters`);
  assert.equal(spec.readAhead,false);
  assert.notEqual(c?.saga?.readAhead,true);
}
assert.equal(cards.filter(c=>c?.saga?.readAhead===true).length,0);

const mythic=byId.get('ench_092');
assert.equal(mythic.name,'La Argentina de las Mil Historias');
assert.equal(mythic.rarity,'Mythic');
assert.equal(normalizeSagaSpec(mythic).finalChapter,5);
assert.deepEqual([...new Set(normalizeSagaSpec(mythic).chapters.map(c=>c.number))],[1,2,3,4,5]);
assert.deepEqual(sagaChaptersCrossed(mythic,1,4).map(c=>c.number),[2,3,4]);

const repeated=normalizeSagaSpec(byId.get('ench_079')).chapters;
assert.ok(repeated.some(c=>c.number===1) && repeated.some(c=>c.number===2),'I, II shared chapter must normalize to both numbers');

for(const id of ['inst_127','conj_090']){
  const e=byId.get(id).effect;
  assert.equal(e.counterType,'lore');
  assert.equal(e.permanentFilter,'Saga');
  assert.equal(e.targetKind,'support');
}
const bell=byId.get('art_072').activatedAbility.effect;
assert.equal(bell.counterType,'lore');
assert.equal(bell.permanentFilter,'Saga');
assert.equal(bell.targetKind,'support');
assert.equal(byId.get('conj_091').effect.type,'proliferate');
assert.ok(sagas.some(c=>normalizeSagaSpec(c).chapters.some(ch=>ch.effect.type==='proliferate')),'a Saga must exercise Proliferate');

const allTriggers=newCards.flatMap(c=>c.triggers||[]);
assert.ok(allTriggers.some(t=>t.event==='saga_chapter_triggered'));
assert.ok(allTriggers.some(t=>t.event==='permanent_sacrificed' && t.filter?.subtype==='Saga'));
const copy=byId.get('inst_128');
assert.equal(copy.effect.type,'copy_ability');
assert.equal(copy.effect.stackFilter,'ability');
assert.equal(copy.effect.mayChooseNewTargets,true);

const tokenEffects=[];
function scanEffects(v){
  if(Array.isArray(v)) return v.forEach(scanEffects);
  if(!v || typeof v!=='object') return;
  if(v.type==='create_tokens') tokenEffects.push(v);
  Object.values(v).forEach(scanEffects);
}
newCards.forEach(scanEffects);
assert.ok(tokenEffects.length>0);
for(const e of tokenEffects){
  assert.equal(e.tokenName,'Vecino');
  assert.equal(e.image,'token_vecino.png');
}

const supported=new Set(['add_counter','bounce','create_tokens','damage','discard','drain','draw','draw_and_lose_life','exile_creature','heal','proliferate','pump','ramp','reanimate','return_lands_from_graveyard','rummage','scry','search_land','surveil']);
for(const saga of sagas){
  for(const ch of normalizeSagaSpec(saga).chapters) assert.ok(supported.has(ch.effect.type),`${saga.id} chapter uses unsupported ${ch.effect.type}`);
}

const ui=read('js/ui.js');
assert.ok(ui.includes("permanentFilter: effect.permanentFilter || null"));
const workflow=read('../.github/workflows/pages.yml');
assert.ok(workflow.includes('regression_legacy_23_17_3_1.zip'));
assert.ok(workflow.includes('ci_regression_manifest_23_17_3_1.txt'));
assert.ok(fs.readFileSync(path.join(__dirname,'ci_regression_manifest_23_17_3_1.txt'),'utf8').includes('test_pool_expansion_iv_sagas_23_16_1_1.mjs'));

console.log('PASS test_pool_expansion_iv_sagas_23_16_1_1.mjs · Pool 760 · +30 (18 Sagas + 12 support) · Lore/Proliferate/chapter payoffs/copy · C10 U12 R7 M1');
