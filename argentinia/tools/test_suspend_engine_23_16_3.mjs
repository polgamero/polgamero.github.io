import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { CURRENT_POOL_MILESTONE, POOL_BASELINE, POOL_MILESTONES } from '../js/poolContract.js';
import {
  SUSPEND_ENGINE_VERSION, normalizeSuspendSpec, hasSuspend, markCardSuspended,
  clearSuspendState, isSuspendedCard, suspendedTimeCount, buildSuspendUpkeepTrigger,
  removeSuspendTimeCounterStorage, addSuspendTimeCounterStorage, buildSuspendCastTrigger,
  suspendEngineSummary
} from '../js/suspendEngine.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const dataFiles=['criaturas.json','instantaneos.json','conjuros.json','encantamientos.json','artefactos.json','tierras.json','planeswalkers.json'];
const collect=(v,out=[])=>{ if(Array.isArray(v)) v.forEach(x=>collect(x,out)); else if(v&&typeof v==='object'){ if(v.id&&v.name&&v.type) out.push(v); else Object.values(v).forEach(x=>collect(x,out)); } return out; };
const cards=dataFiles.flatMap(f=>collect(json(`assets/data/${f}`)));

assert.ok(['23.16.3','23.16.3.1','23.16.4','23.16.4.1','23.16.5','23.16.5.1','23.16.5.2','23.17.1','23.17.2','23.17.3','23.18.3','23.19','23.19.2','23.19.5.4'].includes(ENGINE_VERSION));
assert.equal(SUSPEND_ENGINE_VERSION,'23.16.3');
assert.ok(['mp-23.10.0','mp-23.19.0','mp-23.19.2'].includes(ENGINE_PROTOCOL_VERSION));
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.ok(['pool_expansion_v_790','pool_expansion_vi_820','pool_expansion_vii_850','pool_expansion_viii_880'].includes(CURRENT_POOL_MILESTONE));
assert.ok(POOL_BASELINE.total>=790);
assert.equal(POOL_MILESTONES.pool_expansion_v_790.total,790);
assert.ok(cards.length>=790);

assert.deepEqual(normalizeSuspendSpec({suspend:{time:3,cost:'{1}{R}'}}),{time:3,cost:'{1}{R}',label:null});
assert.deepEqual(normalizeSuspendSpec('2 — {U}'),{time:2,cost:'{U}'});
const fake={id:'test_suspend',name:'Prueba Suspend',type:'Criatura',power:2,toughness:2,suspend:{time:3,cost:'{R}'},_exileObjectId:'exo_test'};
assert.ok(markCardSuspended(fake,{exileObjectId:'exo_test',ownerRole:'local'}));
assert.equal(suspendedTimeCount(fake),3);
assert.equal(isSuspendedCard(fake),true);
const tick=buildSuspendUpkeepTrigger(fake,true);
assert.equal(tick.triggerType,'suspend_tick');
assert.equal(tick.effect.type,'suspend_remove_time');
let r=removeSuspendTimeCounterStorage(fake,1);
assert.deepEqual({before:r.before,after:r.after,removed:r.removed,last:r.lastRemoved},{before:3,after:2,removed:1,last:false});
r=addSuspendTimeCounterStorage(fake,2);
assert.equal(r.after,4);
r=removeSuspendTimeCounterStorage(fake,4);
assert.equal(r.after,0); assert.equal(r.lastRemoved,true);
const castTrigger=buildSuspendCastTrigger(fake,true,{cause:'test'});
assert.equal(castTrigger.triggerType,'suspend_cast');
assert.equal(castTrigger.effect.type,'suspend_cast_from_exile');
clearSuspendState(fake,{clearTime:false});
assert.equal(fake._suspendState,undefined);

const summary=suspendEngineSummary();
assert.equal(summary.handSpecialAction,true);
assert.equal(summary.upkeepTriggerUsesStack,true);
assert.equal(summary.lastTimeTriggerUsesStack,true);
assert.equal(summary.castOptional,true);
assert.equal(summary.castWithoutManaCost,true);
assert.equal(summary.xForcedZero,true);
assert.equal(summary.additionalCostsAllowed,true);
assert.equal(summary.alternativeCostsForbidden,true);
assert.equal(summary.creatureHasteUntilControlLost,true);
assert.equal(summary.proliferateSuspendedCards,false);

const main=read('js/main.js');
const turn=read('js/turnManager.js');
const stack=read('js/stackManager.js');
const ui=read('js/ui.js');
const sync=read('js/matchSync.js');
const copy=read('js/copyEngine.js');
const bot=read('js/bot.js');
assert.ok(main.includes('canSuspendCardFromHand'));
assert.ok(main.includes("castFrom:'suspend'"));
assert.ok(main.includes("baseOverride:'{0}'"));
assert.ok(main.includes("['exile','suspend'].includes(stackItem?.castFrom)"));
assert.ok(main.includes("item._suspendHaste = false"));
assert.ok(turn.includes('collectSuspendUpkeepTriggers(isLocal)'));
assert.ok(stack.includes("effectToApply.type === 'suspend_remove_time'"));
assert.ok(stack.includes("effectToApply.type === 'suspend_cast_from_exile'"));
assert.ok(stack.includes('item.suspendHaste'));
assert.ok(ui.includes('showSuspendCastModal'));
assert.ok(ui.includes('suspend-action-fab'));
assert.ok(sync.includes('suspendEngineVersion'));
assert.ok(sync.includes('suspendHaste'));
assert.ok(copy.includes('suspendEngineVersion: null'));
assert.ok(copy.includes('suspendHaste: false'));
assert.ok(bot.includes('castSuspendedCardForBot'));
assert.ok(stack.includes('add_time_counter_suspended'));
assert.ok(stack.includes('remove_time_counter_suspended'));

const workflow=read('../.github/workflows/pages.yml');
assert.ok(workflow.includes('regression_legacy_23_17_3_1.zip'));
assert.ok(workflow.includes('ci_regression_manifest_23_17_3_1.txt'));
assert.ok(workflow.includes('test_prebuilt_decks_store_23_17_3.mjs'));

console.log('PASS test_suspend_engine_23_16_3.mjs · historical Suspend engine contract survives Pool VI');
