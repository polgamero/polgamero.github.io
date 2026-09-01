import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION, ENGINE_BASELINE } from '../js/version.js';
import { getAnimationTuningCatalog, normalizeAnimationTunings } from '../js/animationDirector.js';
import { AUDIO_CATALOG } from '../js/audioManager.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const director=read('js/animationDirector.js');
const stack=read('js/stackManager.js');
const main=read('js/main.js');
const firebase=read('js/firebaseClientImpl.js');
const manifest=JSON.parse(read('build-manifest.json'));
const workflow=read('../.github/workflows/pages.yml');
const conjuros=JSON.parse(read('assets/data/conjuros.json'));
const planeswalkers=JSON.parse(read('assets/data/planeswalkers.json'));

assert.equal(ENGINE_VERSION,'23.19.5');
assert.equal(ENGINE_PROTOCOL_VERSION,'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(manifest.engineVersion,'23.19.5');
assert.equal(manifest.engineProtocolVersion,'mp-23.19.2');
assert.equal(manifest.firestoreRulesVersion,'23.13.79');
assert.equal(manifest.pool,880);
assert.ok(ENGINE_BASELINE.includes('23.19.4.7 Core Gameplay Feedback Expansion'));

const catalog=getAnimationTuningCatalog();
assert.equal(catalog.length,35,'Animation Studio expands 28 -> 35 rows');
const byKey=new Map(catalog.map(row=>[row.key,row]));
const expected={
  wipe_creatures:['massDestruction','wipe.opus','wipe.mp3'],
  wipe_lands:['massDestruction','wipe.opus','wipe.mp3'],
  graveyard_purge:['graveyardPurge','purga_cementerio.opus','purga_cementerio.mp3'],
  mass_land_return:['massLandReturn','retorno_tierras.opus','retorno_tierras.mp3'],
  fog_global:['fogGlobal','niebla.opus','niebla.mp3'],
  proliferate:['proliferatePulse','proliferar.opus','proliferar.mp3'],
  control_change:['controlChange','control.opus','control.mp3']
};
for(const [key,[id,opus,mp3]] of Object.entries(expected)){
  const row=byKey.get(key); assert.ok(row,`missing ${key}`);
  assert.equal(row.sfxCadence,'single',`${key} must emit one SFX per global resolution`);
  assert.ok(row.sfxIds.includes(id)); assert.ok(AUDIO_CATALOG.sfx[id]);
  assert.ok(row.audioTargets.some(t=>t.id===id&&t.opus===opus&&t.mp3===mp3),`${key} exposes audio targets`);
}
assert.equal(normalizeAnimationTunings({wipe_creatures:{sfxCadence:'per_impact'}}).wipe_creatures.sfxCadence,'single');

// The pool really has these global mechanics; they are not speculative studio demos.
const allCards=[...conjuros,...planeswalkers];
const json=JSON.stringify(allCards);
assert.ok((json.match(/destroy_all_creatures/g)||[]).length>=3,'pool has creature wipes');
assert.ok((JSON.stringify(conjuros).match(/destroy_all_lands/g)||[]).length>=2,'pool has land wipes');

// Global wipes capture visual geometry before mutation, resolve the state, then play one board-level barrier before death triggers.
const creaturePlan=stack.indexOf("snapshot:captureCardVisual(unit,isLocalZone?'local':'rival')");
const creatureMove=stack.indexOf('moveBattlefieldCardToZone(unit.card, ownerDestinationZone(unit.card,isLocalZone,zoneTo))',creaturePlan);
const creatureMovie=stack.indexOf("await queueMassWipeAnimation({wipeKind:'creatures'",creatureMove);
const creatureTriggers=stack.indexOf('queueCreatureDeathBatch(actualDeaths',creatureMovie);
assert.ok(creaturePlan>=0&&creatureMove>creaturePlan&&creatureMovie>creatureMove&&creatureTriggers>creatureMovie,'creature wipe: capture -> rules mutation -> cinematic -> trigger queue');
const landMovie=stack.indexOf("await queueMassWipeAnimation({wipeKind:'lands'");
assert.ok(landMovie>=0 && stack.indexOf('queueCreatureDeathBatch(deadCreatures',landMovie)>landMovie,'land wipe gets one global barrier before death trigger batch');
assert.ok(director.includes("kind:'mass_wipe'") && director.includes("cue.kind==='mass_wipe'"),'mass wipe is multiplayer presentation cue');

// Graveyard purge and mass land return are batch feedback, not N copies of normal exile/land SFX.
assert.ok(stack.includes("cause:'graveyard_purge'"));
assert.ok(director.includes("type==='card_exiled' && event.cause==='graveyard_purge'"));
assert.ok(stack.includes('await queueGraveyardPurgeAnimation'));
assert.ok(stack.includes("sourceZoneForEtb=spec.all?'graveyard_mass':'graveyard'"));
assert.ok(director.includes("type==='land_entered' && event.zoneFrom==='graveyard_mass'"));
assert.ok(stack.includes('await queueMassLandReturnAnimation'));

// Fog and Proliferate each get one global pulse. Counter mutations themselves remain silent.
assert.ok(stack.includes("await queueGlobalBoardEffectAnimation({kind:'fog',isLocal})"));
assert.ok(stack.includes("void queueGlobalBoardEffectAnimation({kind:'proliferate',isLocal})"));
assert.ok(director.includes("cue.kind==='global_board_effect'"));

// Control changes animate the same permanent crossing sides and remain presentation-only,
// including the return path when a temporary/source-bound control effect expires.
assert.ok(main.includes('const controlVisualSnapshot'));
assert.ok(main.includes('queueControlChangeAnimation'));
const relocateStart=main.indexOf('function relocatePermanentToEffectiveController(item)');
const relocateEnd=main.indexOf('export function removeControlEffectFromPermanent',relocateStart);
const relocateBody=main.slice(relocateStart,relocateEnd);
assert.ok(relocateBody.includes('captureCardVisual') && relocateBody.includes('queueControlChangeAnimation'),'control return/expiry also animates');
assert.ok(director.includes("cue.kind==='control_change'"));

// Admin schema/catalog/CI advanced without changing protocol or Firestore Rules.
assert.ok(firebase.includes('schemaVersion: 7'));
assert.ok(workflow.includes('test_mass_event_cinematics_high_impact_23_19_4_8.mjs'));
assert.ok(workflow.includes('Validate Mass Event Cinematics + High-Impact Feedback 23.19.4.8'));

console.log('MASS_EVENT_CINEMATICS_HIGH_IMPACT_23_19_4_8_OK');
console.log('events=creature-wipe+land-wipe+graveyard-purge+mass-land-return+fog+proliferate+control-change');
console.log(`animationRows=${catalog.length} schema=7 pool=${manifest.pool} protocol=${ENGINE_PROTOCOL_VERSION} rules=${FIRESTORE_RULES_VERSION}`);
