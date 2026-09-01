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
const audio=read('js/audioManager.js');
const main=read('js/main.js');
const stack=read('js/stackManager.js');
const bot=read('js/bot.js');
const ui=read('js/ui.js');
const firebase=read('js/firebaseClientImpl.js');
const version=read('js/version.js');
const manifest=JSON.parse(read('build-manifest.json'));
const workflow=read('../.github/workflows/pages.yml');

assert.equal(ENGINE_VERSION,'23.19.4.15');
assert.equal(ENGINE_PROTOCOL_VERSION,'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(manifest.engineVersion,'23.19.4.15');
assert.equal(manifest.engineProtocolVersion,'mp-23.19.2');
assert.equal(manifest.firestoreRulesVersion,'23.13.79');
assert.equal(manifest.pool,880);
assert.ok(ENGINE_BASELINE.includes('23.19.4.6 Rules Integrity + Combat UX + Bot Tactical Hotfix'));

const catalog=getAnimationTuningCatalog();
assert.ok(catalog.length>=28,'Animation Studio retains the 28 Core Gameplay Feedback rows');
const byKey=new Map(catalog.map(row=>[row.key,row]));
const expected={
  land_play:['landPlayed','bajar_tierra.opus','bajar_tierra.mp3'],
  creature_enter:['permanentEntered','permanente.opus','permanente.mp3'],
  support_enter:['permanentEntered','permanente.opus','permanente.mp3'],
  planeswalker_enter:['permanentEntered','permanente.opus','permanente.mp3'],
  fight:['cardImpact','choque.opus','choque.mp3'],
  shuffle:['libraryShuffle','barajar.opus','barajar.mp3'],
  tokens:['tokenCreated','ficha.opus','ficha.mp3'],
  transform:['permanentTransformed','transformar.opus','transformar.mp3'],
  animate_land:['permanentTransformed','transformar.opus','transformar.mp3'],
  spell_cast:['spellCast','hechizo.opus','hechizo.mp3']
};
for(const [key,[id,opus,mp3]] of Object.entries(expected)){
  const row=byKey.get(key);assert.ok(row,`missing ${key}`);
  assert.ok(row.sfxIds.includes(id),`${key} points at ${id}`);
  assert.ok(row.audioTargets.some(t=>t.id===id&&t.opus===opus&&t.mp3===mp3),`${key} exposes exact OPUS/MP3 runtime targets`);
  assert.ok(AUDIO_CATALOG.sfx[id],`AUDIO_CATALOG contains ${id}`);
}
assert.equal(byKey.get('tokens').sfxCadence,'per_batch');
assert.equal(normalizeAnimationTunings({tokens:{sfxCadence:'per_impact'}}).tokens.sfxCadence,'per_batch','token cadence is canonical: once per batch');

// New semantic event bridges are presentation-only and reuse the multiplayer cue envelope.
for(const type of ['permanent_transformed','permanent_animated','land_entered','permanent_entered','spell_cast_visual']) assert.ok(director.includes(`type==='${type}'`),`director consumes ${type}`);
for(const kind of ['fight','library_shuffle','token_batch','transform']) assert.ok(director.includes(`cue.kind==='${kind}'`),`remote playback consumes ${kind}`);
assert.ok(director.includes("zone==='stack'"), 'stack has a stable pre-snapshot anchor for remote cast cinematics');
assert.ok(director.includes('synthetic:true'), 'empty remote stack can use a synthetic presentation-only target');

// Permanent spells sound on resolution; only instants/sorceries get the cast cue to avoid double feedback.
assert.ok(stack.includes("printedType.includes('Instantáneo')") && stack.includes("printedType.includes('Conjuro')"));
assert.ok(stack.includes("type:'spell_cast_visual'"));
assert.ok(stack.includes("type:'permanent_entered'"));
assert.ok(main.includes("type:'land_entered'"));

// Fight uses a presentation barrier before state-based deaths.
const fightIdx=stack.indexOf('await queueFightAnimation');
assert.ok(fightIdx>=0,'Fight queues a cinematic');
const deathIdx=stack.indexOf('checkAllDeaths()',fightIdx);
assert.ok(deathIdx>fightIdx,'Fight death/SBA cleanup waits until the impact animation finishes');

// Searches shuffle visually once after the searched movement, and no private library identity is published.
assert.ok(main.includes('await queueLibraryShuffleAnimation({ isLocal: ownerIsLocal })') || main.includes('await queueLibraryShuffleAnimation({isLocal:ownerIsLocal})'));
assert.ok(director.includes("emitPresentationCue({kind:'library_shuffle'"));
assert.ok(!/library_shuffle[^\n]{0,250}(cardId|cardName|cards|order)/.test(director),'shuffle cue does not publish private library identities/order');

// Token batches materialize N cards but emit/play one canonical SFX for the whole batch.
assert.ok(stack.includes('queueTokenBatchAnimation'));
assert.ok(director.includes("sfxCadence:'per_batch'"));
assert.ok(/animateTokenBatch[\s\S]{0,2500}playAnimationSfx\('tokenCreated','tokens'/.test(director));

// Transform / animate-land hooks use the actual semantic events rather than diff guessing.
assert.ok(main.includes("type:'permanent_animated'"));
assert.ok(stack.includes("type:'permanent_transformed'") || main.includes("type:'permanent_transformed'"));

// Admin/Test Lab expose all new verbs and the batch cadence.
for(const label of ['Bajar Tierra','Entrada de Criatura','Entrada a Support','Entrada de Semidiós','Pelear','Barajar biblioteca','Crear fichas','Transformar DFC','Animar Tierra','Castear Instantáneo / Conjuro']) assert.ok(director.includes(label));
assert.ok(ui.includes("per_batch") && ui.includes('1 vez por lote'));
assert.ok(ui.includes('Volumen relativo'));
assert.ok(/schemaVersion:\s*(6|7)/.test(firebase));

assert.ok(version.includes("ENGINE_VERSION = '23.19.4.15'"));
assert.ok(workflow.includes('test_core_gameplay_feedback_expansion_23_19_4_7.mjs'),'CI whitelist retains v23.19.4.7 contract');
assert.ok(workflow.includes('Validate Core Gameplay Feedback Expansion 23.19.4.7'),'CI executes v23.19.4.7 contract');

console.log('CORE_GAMEPLAY_FEEDBACK_EXPANSION_23_19_4_7_OK');
console.log('verbs=land-play+permanent-entry+fight+shuffle+token-batch+transform+animate-land+instant-sorcery-cast');
console.log('multiplayer=presentation-cues privacy=shuffle-safe token-sfx=once-per-batch fight=impact-before-sba');
console.log(`animationRows=${catalog.length} schema=6 pool=${manifest.pool} protocol=${ENGINE_PROTOCOL_VERSION} rules=${FIRESTORE_RULES_VERSION}`);
