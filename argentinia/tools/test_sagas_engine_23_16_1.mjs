import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { CURRENT_POOL_MILESTONE, POOL_BASELINE } from '../js/poolContract.js';
import {
  SAGA_ENGINE_VERSION, isSagaCard, normalizeSagaSpec, sagaChaptersCrossed,
  buildSagaChapterTriggerDescriptors, getSagaFinalChapter, getSagaLoreCount,
  shouldSacrificeSaga, sagaUiState, sagaEngineSummary
} from '../js/sagaEngine.js';
import { collectSagaStateActions } from '../js/rulesKernel.js';
import { buildCopiedCard, buildBecameCopyCard, buildPermanentCopyToken } from '../js/copyEngine.js';
import { GAME_EVENT_TYPES } from '../js/eventEngine.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

assert.ok(['23.16.1','23.16.1.1','23.16.2','23.16.2.1','23.16.3','23.16.3.1','23.16.4','23.16.4.1','23.16.5','23.16.5.1','23.16.5.2','23.17.1','23.17.2','23.17.3','23.18.3','23.19','23.19.2','23.19.5.2'].includes(ENGINE_VERSION),'Saga Engine contract must survive Pool Expansion IV');
assert.equal(SAGA_ENGINE_VERSION,'23.16.1');
assert.ok(['mp-23.10.0','mp-23.19.0','mp-23.19.2'].includes(ENGINE_PROTOCOL_VERSION));
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.ok(['pool_expansion_iii_730','pool_expansion_iv_760','pool_expansion_v_790','pool_expansion_vi_820','pool_expansion_vii_850','pool_expansion_viii_880'].includes(CURRENT_POOL_MILESTONE));
assert.ok(POOL_BASELINE.total>=730);
assert.ok(GAME_EVENT_TYPES.includes('saga_chapter_triggered'));

const sagaCard={
  id:'test_saga', name:'Historia del Obelisco', type:'Encantamiento — Saga', manaCost:'{2}{W}',
  saga:{ chapters:[
    { number:1, id:'i', text:'Capítulo I', effect:{type:'gain_life',amount:2} },
    { number:2, id:'ii_a', text:'Capítulo II A', effect:{type:'draw',amount:1} },
    { number:2, id:'ii_b', text:'Capítulo II B', effect:{type:'add_counter',counterType:'shield',amount:1}, requiresTarget:true },
    { number:3, id:'iii', text:'Capítulo III', effect:{type:'create_tokens',amount:1,tokenName:'Vecino'} }
  ]}
};
assert.ok(isSagaCard(sagaCard));
assert.ok(!isSagaCard({type:'Encantamiento'}));
const spec=normalizeSagaSpec(sagaCard);
assert.equal(spec.valid,true);
assert.equal(spec.finalChapter,3);
assert.equal(spec.readAhead,false);
assert.deepEqual(spec.chapters.map(c=>c.number),[1,2,2,3]);
assert.deepEqual(sagaChaptersCrossed(sagaCard,0,1).map(c=>c.number),[1]);
assert.deepEqual(sagaChaptersCrossed(sagaCard,1,3).map(c=>c.number),[2,2,3]);
assert.deepEqual(sagaChaptersCrossed(sagaCard,3,1),[],'removing Lore never retriggers prior chapters');

const item={card:sagaCard,counters:{lore:1},_syncObjectId:'saga_sync_1',tapped:true,damage:2};
assert.equal(getSagaLoreCount(item),1);
assert.equal(getSagaFinalChapter(sagaCard),3);
const jumped=buildSagaChapterTriggerDescriptors(item,true,1,3,{cause:'proliferate'});
assert.equal(jumped.length,3);
assert.deepEqual(jumped.map(e=>e.sagaChapter),[2,2,3]);
assert.ok(jumped.every(e=>e.triggerType==='saga_chapter' && e.sourceItem===item));
item.counters.lore=3;
assert.equal(shouldSacrificeSaga(item,{hasPendingChapter:true}),false);
assert.equal(shouldSacrificeSaga(item,{hasPendingChapter:false}),true);
const ui=sagaUiState(item);
assert.deepEqual(ui.chapters.map(c=>c.number),[1,2,3],'UI track must dedupe multiple abilities on the same chapter number');
assert.ok(ui.chapters.every(c=>c.completed));

const state={
  localCombat:[],rivalCombat:[],localSupport:[item],rivalSupport:[],localLands:[],rivalLands:[],localPlaneswalkers:[],rivalPlaneswalkers:[],
  localHand:[],rivalHand:[],localGraveyard:[],rivalGraveyard:[],localExile:[],rivalExile:[]
};
assert.equal(collectSagaStateActions(state,{hasPendingSagaChapter:()=>true}).length,0);
const sagaSba=collectSagaStateActions(state,{hasPendingSagaChapter:()=>false});
assert.equal(sagaSba.length,1);
assert.equal(sagaSba[0].reason,'saga_complete');
assert.equal(sagaSba[0].finalChapter,3);

// Copy Engine: saga schema is a copiable characteristic, but runtime Lore/tap/damage are not.
const copiedCard=buildCopiedCard(sagaCard,{id:'copy_saga'});
assert.deepEqual(copiedCard.saga,sagaCard.saga);
const noSagaCopy=buildCopiedCard(sagaCard,{id:'copy_without_saga',overrides:{type:'Encantamiento',saga:null}});
assert.equal(isSagaCard(noSagaCopy),false,'Copy overrides can explicitly remove Saga characteristics');
const targetCard={id:'target',name:'Otra cosa',type:'Artefacto',manaCost:'{1}',text:'x'};
const became=buildBecameCopyCard(targetCard,sagaCard);
assert.deepEqual(became.saga,sagaCard.saga);
const tokenCopy=buildPermanentCopyToken(item,{id:'token_saga'});
assert.equal(tokenCopy.card.isToken,true);
assert.deepEqual(tokenCopy.card.saga,sagaCard.saga);
assert.equal(tokenCopy.item.counters?.lore || 0,0,'token copy does not copy source Lore runtime state');
assert.equal(tokenCopy.item.damage || 0,0,'token copy does not copy marked damage');

const summary=sagaEngineSummary();
assert.equal(summary.chaptersUseStack,true);
assert.equal(summary.crossedChaptersTrigger,true);
assert.equal(summary.proliferateCompatible,true);
assert.equal(summary.finalChapterSacrificeSba,true);
assert.equal(summary.readAhead,false);
assert.equal(summary.timeCounters,false);

// Static integration markers: main1 turn action, entry Lore, Stack/APNAP, SBA, multiplayer and UI.
const main=read('js/main.js');
for(const marker of [
  "addCountersDetailed(item,'lore',1,{queue:false,cause:'saga_entry'",
  "type:'saga_chapter_triggered'",
  "entry.triggerType==='saga_chapter'",
  'markSagaChapterPending', 'hasPendingSagaChapter', 'removeSbaSaga', "reason:'post_trigger_ordering'"
]) assert.ok(main.includes(marker),`main missing ${marker}`);

const turn=read('js/turnManager.js');
assert.ok(turn.includes("if (state.phase === 'main1')"));
assert.ok(turn.includes('advanceSagaLoreForPrecombatMainPhase'));

const sync=read('js/matchSync.js');
for(const marker of ['sagaChapter:', 'sagaChapterRoman:', 'sagaChapterSpecKey:', 'sagaLoreBefore:', 'sagaLoreAfter:', 'sagaPendingKey:']) {
  assert.ok(sync.includes(marker),`match sync missing ${marker}`);
}

const uiSource=read('js/ui.js');
for(const marker of ['sagaUiState', 'saga-chapter-track', 'saga-chapter-pill']) assert.ok(uiSource.includes(marker),`UI missing ${marker}`);
const css=read('css/style.css');
assert.ok(css.includes('.saga-chapter-track'));
assert.ok(css.includes('.saga-chapter-pill.current'));

const gameTexts=read('js/gameTexts.js');
for(const key of ['saga.enterLore','saga.mainLore','saga.completed']) assert.ok(gameTexts.includes(`'${key}'`));

// Engine-only release: no Saga content yet and Time remains reserved for Suspend/Cast-from-Exile.
const dataFiles=['criaturas.json','instantaneos.json','conjuros.json','encantamientos.json','artefactos.json','tierras.json','planeswalkers.json'];
let cards=[];
for(const filename of dataFiles){
  const parsed=JSON.parse(read(`assets/data/${filename}`));
  cards.push(...(Array.isArray(parsed)?parsed:Object.values(parsed).flat().filter(v=>v && typeof v==='object')));
}
// Robust flatten for category JSONs that are wrappers.
if(cards.length!==730){
  cards=[];
  const visit=value=>{ if(Array.isArray(value)) value.forEach(visit); else if(value && typeof value==='object'){ if(value.id && value.name && value.type) cards.push(value); else Object.values(value).forEach(visit); } };
  for(const filename of dataFiles) visit(JSON.parse(read(`assets/data/${filename}`)));
}
assert.equal(cards.length,POOL_BASELINE.total);
const liveSagas=cards.filter(card=>isSagaCard(card));
assert.ok(liveSagas.every(card=>normalizeSagaSpec(card).valid),'all live Saga content must satisfy the 23.16.1 schema');
assert.equal(cards.filter(card=>card?.saga?.readAhead===true).length,0);

const workflow=read('../.github/workflows/pages.yml');
assert.ok(workflow.includes('regression_legacy_23_17_3_1.zip'));
assert.ok(workflow.includes('ci_regression_manifest_23_17_3_1.txt'));
assert.ok(fs.readFileSync(path.join(__dirname,'ci_regression_manifest_23_17_3_1.txt'),'utf8').includes('test_sagas_engine_23_16_1.mjs'));

console.log('PASS test_sagas_engine_23_16_1.mjs · Lore/main1 + chapter Stack/APNAP + Proliferate + SBA + Copy + multiplayer/UI ready · Pool 730');
