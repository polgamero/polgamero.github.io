import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const manifest = JSON.parse(read('build-manifest.json'));
const director = read('js/animationDirector.js');
const audio = read('js/audioManager.js');
const main = read('js/main.js');
const stack = read('js/stackManager.js');
const ui = read('js/ui.js');

assert.equal(ENGINE_VERSION, '23.19.4.5');
assert.equal(ENGINE_PROTOCOL_VERSION, 'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION, '23.13.79');
assert.equal(manifest.engineVersion, '23.19.4.5');
assert.equal(manifest.firestoreRulesVersion, '23.13.79');
assert.equal(manifest.pool, 880);
assert.ok(['Animation Tuning Matrix + Draggable Test Console','Animation Actor Parity + SFX Cue Semantics'].includes(manifest.label));

// Director remains presentation-only and exposes the generic zone bridge.
for (const token of [
  'captureStackVisual', 'captureZoneAnchor', 'captureHandCardVisual',
  'queueZoneTransitionAnimation', 'queuePermanentExitAnimation',
  'queueReanimateAnimation', 'queueGameEventAnimation'
]) assert.ok(director.includes(`function ${token}`) || director.includes(`function ${token}(`) || director.includes(`export function ${token}`), `director:${token}`);
assert.ok(director.includes("if(type==='card_drawn') transition='draw'"), 'event:draw');
assert.ok(director.includes("else if(type==='card_discarded') transition=event.zoneTo==='exile' ? 'exile' : 'discard'"), 'event:discard/replacement-exile');
assert.ok(director.includes("else if(type==='spell_countered') transition='counter'"), 'event:counter');
assert.ok(director.includes("event.cause==='bounce'"), 'event:bounce');
assert.ok(director.includes("transition='graveyard'"), 'event:graveyard');
assert.ok(director.includes("transition='exile'"), 'event:exile');
assert.ok(director.includes("transition:'reanimate'"), 'event:reanimate');
assert.ok(!director.includes('state.local'), 'director must not own gameplay state');
assert.ok(!director.includes('state.rival'), 'director must not own gameplay state');

// Animation Studio 2.1: enough vertical geometry to stop squeezing/overlap + real anchors.
assert.ok(director.includes('min-height:760px'), 'studio minimum height');
assert.ok(director.includes('max-height:none'), 'studio must not be viewport-clamped');
assert.ok(director.includes('grid-template-rows:16% 32% 32% 16%'), 'studio row geometry');
assert.ok(director.includes('.arg-animation-lab-field-half .arg-animation-lab-card{height:84%;width:auto'), 'field cards fit their rows');
assert.ok(!director.includes('max-height:76vh'), 'old compressed lab height removed');
for (const token of ['rival-library','rival-graveyard','rival-exile','local-library','local-graveyard','local-exile','data-lab-stack']) {
  assert.ok(director.includes(token), `studio anchor:${token}`);
}
for (const label of ['Counter','Exilio','Volver a mano','Robo','Descarte','Sacrificio','Cementerio','Reanimar']) {
  assert.ok(director.includes(`>${label}<`), `studio button:${label}`);
}
assert.ok(director.includes('data-animation-lab-speed'), 'independent lab speed selector retained');
assert.ok(director.includes("assets/images/ui/fondo.png"), 'real board background retained');

// Every current animation family has an explicit SFX contract (OPUS first + MP3 fallback).
const sfxFiles = [
  'tierra', 'choque', 'golpe_jugador',
  'iniciativa', 'doble_golpe', 'escudo', 'toque_mortal', 'indestructible',
  'counter', 'exilio', 'volver_mano', 'robo', 'descarte', 'sacrificio', 'cementerio', 'reanimar'
];
for (const stem of sfxFiles) {
  assert.ok(audio.includes(`./assets/sounds/sfx/${stem}.opus`), `sfx opus:${stem}`);
  assert.ok(audio.includes(`./assets/sounds/sfx/${stem}.mp3`), `sfx mp3:${stem}`);
}
for (const id of ['firstStrike','doubleStrike','shieldImpact','deathtouchImpact','indestructibleImpact','spellCountered','cardExiled','cardBounced','cardDrawn','cardDiscarded','cardSacrificed','cardToGraveyard','cardReanimated']) {
  assert.ok(audio.includes(`${id}: Object.freeze({`), `sfx id:${id}`);
}
assert.match(director, /entry\.shieldConsumed \? 'shieldImpact'/);
assert.match(director, /entry\.indestructibleSurvived \? 'indestructibleImpact'/);
assert.match(director, /entry\.deathtouchHit \? 'deathtouchImpact'/);
assert.match(director, /payload\?\.doubleStrikePass \? 'doubleStrike'/);
assert.match(director, /payload\?\.stepKind==='first_strike' \? 'firstStrike'/);
for (const pair of [
  ["kind==='counter'", "sfx='spellCountered'"],
  ["kind==='exile'", "sfx='cardExiled'"],
  ["kind==='bounce'", "sfx='cardBounced'"],
  ["kind==='draw'", "sfx='cardDrawn'"],
  ["kind==='discard'", "sfx='cardDiscarded'"],
  ["kind==='sacrifice'", "sfx='cardSacrificed'"],
  ["kind==='reanimate'", "sfx='cardReanimated'"],
  ["sfx='cardToGraveyard'", "sfx='cardToGraveyard'"]
]) for (const token of pair) assert.ok(director.includes(token), `zone sfx:${token}`);

// Runtime integration: bridge fires before trigger generation/render; real board anchors are addressable.
assert.match(main, /try \{ void queueGameEventAnimation\(rawEvent\); \} catch \{\}/);
assert.ok(main.includes("queuePermanentExitAnimation({item,isLocal,transition:'sacrifice'"), 'single sacrifice hook');
assert.ok((main.match(/queuePermanentExitAnimation\(\{item,isLocal,transition:'sacrifice'/g) || []).length >= 2, 'single+batch sacrifice hooks');
assert.ok(stack.includes("cardDiv.dataset.stackId = String(item.id)"), 'stack visual id');
assert.ok(stack.includes("cardDiv.dataset.side = item.isLocal ? 'local' : 'rival'"), 'stack visual side');
assert.ok(stack.includes("queueReanimateAnimation({card:revivedCard,isLocal})"), 'reanimate hook');
assert.ok(ui.includes("dataset.animationZone = 'library'"), 'library anchor');
assert.ok(ui.includes("dataset.animationZone = 'graveyard'"), 'graveyard anchor');
assert.ok(ui.includes("dataset.animationZone = 'exile'"), 'exile anchor');

console.log('ZONE_TRANSITIONS_ANIMATION_STUDIO_23_19_4_2_OK');
console.log('zones=counter+exile+bounce+draw+discard+sacrifice+graveyard+reanimate');
console.log('studio=height-fix+real-zone-anchors+speed-override');
console.log('sfx=16-families opus+mp3');
console.log('rules=23.13.79 unchanged protocol=mp-23.19.2 pool=880');
