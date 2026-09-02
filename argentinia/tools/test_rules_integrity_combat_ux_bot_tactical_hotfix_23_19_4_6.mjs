import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION, ENGINE_BASELINE } from '../js/version.js';
import { previewReplacementEvent } from '../js/replacementEngine.js';
import { normalizeAnimationTunings } from '../js/animationDirector.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const main=read('js/main.js');
const bot=read('js/bot.js');
const ui=read('js/ui.js');
const audio=read('js/audioManager.js');
const director=read('js/animationDirector.js');
const firebase=read('js/firebaseClientImpl.js');
const stack=read('js/stackManager.js');
const turn=read('js/turnManager.js');
const texts=read('js/gameTexts.js');
const version=read('js/version.js');
const manifest=JSON.parse(read('build-manifest.json'));
const workflow=read('../.github/workflows/pages.yml');

assert.ok(['23.19.4.6','23.19.5.1'].includes(ENGINE_VERSION));
assert.equal(ENGINE_PROTOCOL_VERSION,'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(manifest.engineVersion,ENGINE_VERSION);
assert.equal(manifest.engineProtocolVersion,'mp-23.19.2');
assert.equal(manifest.firestoreRulesVersion,'23.13.79');
assert.equal(manifest.pool,880);
assert.ok(ENGINE_BASELINE.includes('23.19.4.5 Animation Actor Parity + SFX Cue Semantics + Admin Audio Targets'));

// Replacement preview must be pure: a Shield can be consumed in the prediction without
// touching the real battlefield object used by the live engine.
const shielded={card:{id:'qa_guardaparque',name:'QA Guardaparque',power:4,toughness:3,keywords:[]},counters:{shield:1},damageTaken:0};
const previewState={localCombat:[shielded],rivalCombat:[],localSupports:[],rivalSupports:[],localLands:[],rivalLands:[],localPlaneswalkers:[],rivalPlaneswalkers:[],activeReplacementEffects:[]};
const preview=previewReplacementEvent(previewState,{type:'damage',amount:3,item:shielded,targetItem:shielded,targetIsLocal:true,sourceIsLocal:false,cause:'fight_preview'});
assert.equal(preview.event.amount,0,'Shield must prevent the previewed damage');
assert.equal(shielded.counters.shield,1,'previewReplacementEvent must not mutate the real Shield counter');
assert.equal(preview.event.counterRemovedByReplacement?.counterType,'shield','preview reports Shield consumption');
assert.equal(preview.event.counterRemovedByReplacement?.amount,1);

// Ward is committed after the target exists in Stack, and the same frontier covers
// triggers/Sagas, copies and multi-target objects.
assert.ok(main.includes('function collectWardsForDeclaredTarget'));
assert.ok(main.includes("targetObj.type === 'multi'"),'Ward collector flattens multi-target declarations');
assert.ok(main.includes('settleWardForCommittedStackItem(stackItem'));
assert.ok(main.includes("recordTelemetryEvent('ward_triggered'"));
assert.ok(main.includes("recordTelemetryEvent('ward_paid'"));
assert.ok(main.includes("recordTelemetryEvent('ward_countered'"));
assert.ok(main.includes("decision.type === 'ward_pay'"),'multiplayer Ward payment has an explicit remote decision');
assert.ok(stack.includes('settleWardForCommittedStackItem(copy'),'copied/retargeted Stack objects re-enter Ward frontier');
assert.ok(/processTriggerBatch[\s\S]{0,5000}settleWardForCommittedStackItem/.test(main),'trigger/Saga batches cross the committed Ward frontier');

// 20 is starting/reference life, never an authoritative maximum. render() must not write HP.
const renderStart=ui.indexOf('export function render(');
assert.ok(renderStart>=0);
const nextUiExport=ui.indexOf('\nexport function ',renderStart+20);
const renderChunk=ui.slice(renderStart,nextUiExport>renderStart?nextUiExport:ui.length);
assert.ok(!/state\.[A-Za-z0-9_.\[\]]+\s*(?<![=!<>])=(?!=)/.test(renderChunk),'render() must not assign gameplay/control state');
assert.ok(turn.includes("logMsg(gameText('combat.autoZeroBlockers'))") && turn.includes('executeRivalAttack();'),'zero-block declaration moved out of render into turn semantics');
assert.ok(!ui.includes('Math.min(20, state.localHP)') && !ui.includes('Math.min(20, state.rivalHP)'));
assert.ok(/Math\.min\(100,\s*\(hp\s*\/\s*20\)\s*\*\s*100\)/.test(director),'HP bar saturates visually without capping numeric life');

// Blockers are editable until confirmation.
assert.ok(main.includes('item.blockingIndex = null') || main.includes('item.blockingIndex=null'));
assert.ok(main.includes("gameText('combat.local.blockRemoved'"));
assert.ok(texts.includes("'combat.local.blockRemoved'"));

// Shield UX/telemetry explains actual consumption, eliminating the ambiguous generic message.
assert.ok(main.includes("recordTelemetryEvent('shield_consumed'"));
assert.ok(texts.includes("'replacement.shield.consumed'"));

// Bot Fight uses the same replacement semantics in preview and logs the tactical prediction.
assert.ok(bot.includes("import { previewReplacementEvent } from './replacementEngine.js'"));
assert.ok(bot.includes('function predictFightOutcome'));
assert.ok(bot.includes("cause:'fight_preview'") || bot.includes("cause: 'fight_preview'"));
assert.ok(bot.includes("recordTelemetryEvent('bot_fight_evaluation'"));
assert.ok(bot.includes('if (!outcome.theirsDies) return null'),'bot rejects fights that cannot actually remove the target');

// Medium gets wide-board saturation awareness while Hard keeps Combat Bot 2.0 intact.
assert.ok(bot.includes("normalizeBotDifficulty(state.botDifficulty)==='medium'"));
assert.ok(bot.includes('eligibleAttackers.length>publicDefenders.length'));
assert.ok(bot.includes("recordTelemetryEvent('bot_attack_plan'"));
assert.ok(bot.includes("recordTelemetryEvent('bot_combat2_attack_plan'"));

// Healing is no longer automatic in Main 2 at full life.
assert.ok(bot.includes('function shouldBotActivateHealing'));
assert.ok(bot.includes("state.phase==='main2' && hp<=16"));
assert.ok(bot.includes("c.effect?.type === 'heal' && !shouldBotActivateHealing(c.effect, 'main2')"),'heal-only spells are also health-aware');

// Admin animation mastering: global Options volume × per-animation relative multiplier.
const tunings=normalizeAnimationTunings({draw:{relativeVolume:1.2},land:{relativeVolume:99},clash:{relativeVolume:.01}});
assert.equal(tunings.draw.relativeVolume,1.2);
assert.equal(tunings.land.relativeVolume,2);
assert.equal(tunings.clash.relativeVolume,.25);
assert.ok(ui.includes('Volumen relativo'));
assert.ok(ui.includes('data-animation-tuning-volume'));
assert.ok(audio.includes('volumeMultiplier') && audio.includes('settings.sfxVolume * relativeVolume'));
assert.ok(director.includes('volumeMultiplier:getAnimationTuning(tuningKey).relativeVolume'));
assert.ok(firebase.includes('relativeVolume:') && /schemaVersion:\s*(5|6|7)/.test(firebase));

// Actor-correct sacrifice copy and new observability hooks.
assert.ok(texts.includes("'sacrifice.self.bot'"));
assert.ok(main.includes("isLocal ? 'sacrifice.self' : 'sacrifice.self.bot'"));
for(const event of ['ward_triggered','ward_paid','ward_countered','shield_consumed']) assert.ok(main.includes(`'${event}'`));
for(const event of ['bot_fight_evaluation','bot_attack_plan']) assert.ok(bot.includes(`'${event}'`));

assert.ok(/ENGINE_VERSION = '23\.19\.4\.(6|7|8|9|10|11|12|13|14|15)'/.test(version) || /ENGINE_VERSION = '23\.19\.5(?:\.1)?'/.test(version));
assert.ok(workflow.includes('test_rules_integrity_combat_ux_bot_tactical_hotfix_23_19_4_6.mjs'),'CI whitelist retains v23.19.4.6 contract');
assert.ok(workflow.includes('Validate Rules Integrity + Combat UX + Bot Tactical Hotfix 23.19.4.6'),'CI runs v23.19.4.6 contract');

console.log('RULES_INTEGRITY_COMBAT_UX_BOT_TACTICAL_HOTFIX_23_19_4_6_OK');
console.log('ward=stack-committed+saga-trigger+multi-target life=unbounded-render-readonly blocker-edit=undo+reassign');
console.log('bot=fight-replacement-preview+medium-wide-saturation heal=health-aware shield=explicit-telemetry');
console.log('animation-audio=relative-volume-0.25..2.00 global-options-multiplier schema=5');
console.log(`pool=${manifest.pool} protocol=${ENGINE_PROTOCOL_VERSION} rules=${FIRESTORE_RULES_VERSION} unchanged`);
