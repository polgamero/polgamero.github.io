import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { getAnimationTuningCatalog, normalizeAnimationTunings } from '../js/animationDirector.js';
import { buildMyPublicPatch, extractRivalStateFromPublicDoc, extractMyStateFromPublicDoc } from '../js/matchSync.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const director=read('js/animationDirector.js');
const main=read('js/main.js');
const bot=read('js/bot.js');
const ui=read('js/ui.js');
const firebase=read('js/firebaseClientImpl.js');
const manifest=JSON.parse(read('build-manifest.json'));
const workflow=fs.readFileSync(path.join(root,'..','.github','workflows','pages.yml'),'utf8');

assert.equal(ENGINE_VERSION,'23.19.5.6');
assert.equal(ENGINE_PROTOCOL_VERSION,'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.80');
assert.equal(manifest.engineVersion,'23.19.5.6');
assert.equal(manifest.engineProtocolVersion,'mp-23.19.2');
assert.equal(manifest.protocolVersion,'mp-23.19.2');
assert.equal(manifest.firestoreRulesVersion,'23.13.80');
assert.equal(manifest.pool,880);
assert.ok(['Economy Write Firewall + Server-Required Cutover','Admin Economy + Statistics + Immutable Audit Authority','Match Settlement + Anti-Farming + Admission Control + Economy Pending UX','Store / Craft / Prebuilt / Classifieds / Username Authority + Packs / Cofre / Mythic + Deck Intelligence 2.0','Packs / Cofre / Mythic Authority + Deck Intelligence 2.0','Animation Actor Parity + SFX Cue Semantics + Admin Audio Targets','Rules Integrity + Combat UX + Bot Tactical Hotfix','Core Gameplay Feedback Expansion','Mass Event Cinematics + High-Impact Feedback','Commercial IP Remediation Wave 1 — Identity Clean-room','Commercial IP Remediation Wave 2 — Envase Hermético','Commercial IP Remediation Wave 3 — Venues + Institutions Genericization','Commercial IP Remediation — Residual YELLOW Closure','Global Terminology Clean-room — Owner Dictionary 44/44','Commercial Readiness Closure + Clean-room Verification','Semidiós Rules Text + Creencia UX Hotfix','Economy Authority Foundation + Secure Account Bootstrap','Economy Authority Foundation + Deck/Admin/Land UX Stabilization RC2'].includes(manifest.label));

// Admin semantics: the old "Fin" is migrated to the actual cue meaning, "Momento clave".
const catalog=getAnimationTuningCatalog();
assert.ok(catalog.length>=18);
for(const key of ['clash','multi','trample','first','double','shield','deathtouch','indestructible','player']) {
  const def=catalog.find(entry=>entry.key===key);
  assert.equal(def?.defaultSfxMoment,'key',`${key}: default key moment`);
  assert.equal(def?.sfxCadence,'per_impact',`${key}: one SFX per actual impact`);
}
for(const key of ['land','counter','exile','bounce','draw','discard','sacrifice','graveyard','reanimate']) {
  const def=catalog.find(entry=>entry.key===key);
  assert.equal(def?.sfxCadence,'single',`${key}: single-shot cadence`);
}
const migrated=normalizeAnimationTunings({multi:{relativeSpeed:.75,sfxTiming:'end'},land:{relativeSpeed:1,sfxTiming:'start'}});
assert.equal(migrated.multi.sfxMoment,'key');
assert.equal(migrated.multi.sfxCadence,'per_impact');
assert.equal(migrated.land.sfxMoment,'start');
assert.equal(migrated.land.sfxCadence,'single');
assert.ok(ui.includes('>Momento clave<'),'Admin names the semantic cue, not a fake animation end');
assert.ok(ui.includes('>Cadencia<'),'Admin exposes canonical cadence');
assert.ok(ui.includes('>OPUS<'),'Admin exposes OPUS target column');
assert.ok(ui.includes('>fallback MP3<'),'Admin exposes MP3 fallback target column');
assert.ok(ui.includes("'per_impact'") && ui.includes('Por impacto'),'Admin labels per-impact cadence');

// Admin audio targets are derived from the same AUDIO_CATALOG used by runtime, never handwritten filenames in UI.
const audioTargets=Object.fromEntries(catalog.map(def => [def.key,(def.audioTargets || []).map(target => [target.opus,target.mp3])]));
assert.deepEqual(audioTargets.land,[['tierra.opus','tierra.mp3']]);
assert.deepEqual(audioTargets.clash,[['choque.opus','choque.mp3']]);
assert.deepEqual(audioTargets.multi,[['choque.opus','choque.mp3']]);
assert.deepEqual(audioTargets.trample,[['choque.opus','choque.mp3'],['golpe_jugador.opus','golpe_jugador.mp3']]);
assert.deepEqual(audioTargets.first,[['iniciativa.opus','iniciativa.mp3']]);
assert.deepEqual(audioTargets.double,[['doble_golpe.opus','doble_golpe.mp3']]);
assert.deepEqual(audioTargets.shield,[['escudo.opus','escudo.mp3']]);
assert.deepEqual(audioTargets.deathtouch,[['toque_mortal.opus','toque_mortal.mp3']]);
assert.deepEqual(audioTargets.indestructible,[['indestructible.opus','indestructible.mp3']]);
assert.deepEqual(audioTargets.player,[['golpe_jugador.opus','golpe_jugador.mp3']]);
assert.deepEqual(audioTargets.counter,[['counter.opus','counter.mp3']]);
assert.deepEqual(audioTargets.exile,[['exilio.opus','exilio.mp3']]);
assert.deepEqual(audioTargets.bounce,[['volver_mano.opus','volver_mano.mp3']]);
assert.deepEqual(audioTargets.draw,[['robo.opus','robo.mp3']]);
assert.deepEqual(audioTargets.discard,[['descarte.opus','descarte.mp3']]);
assert.deepEqual(audioTargets.sacrifice,[['sacrificio.opus','sacrificio.mp3']]);
assert.deepEqual(audioTargets.graveyard,[['cementerio.opus','cementerio.mp3']]);
assert.deepEqual(audioTargets.reanimate,[['reanimar.opus','reanimar.mp3']]);
assert.ok(director.includes("import { AUDIO_CATALOG, playSfx } from './audioManager.js';"),'Animation catalog resolves display targets from runtime audio catalog');
assert.ok(ui.includes('def.audioTargets'),'UI renders canonical audio targets from Animation Director');
assert.ok(/schemaVersion:\s*(5|6|7)/.test(firebase),'Animation policy schema v5+');
assert.ok(firebase.includes("sfxMoment: value.sfxMoment === 'key' ? 'key'"),'Firestore policy sanitizes key/start moment');

// Runtime cadence: the impact hook is physically inside the defender loop. N blockers => N impact cues.
const loopAt=director.indexOf('for (let i=0;i<defenderClones.length;i+=1)');
const keySfxAt=director.indexOf("playAnimationSfx(impactSfx,impactTuningKey,'key')",loopAt);
const loopEnd=director.indexOf("if(playerSnap && Number(payload?.playerDamage)>0)",loopAt);
assert.ok(loopAt>=0 && keySfxAt>loopAt && keySfxAt<loopEnd,'each defender leg owns its own key SFX');
assert.ok(director.includes("playAnimationSfx('playerImpact',playerImpactTuningKey,'key')"),'trample/player leg has its own key SFX');
assert.ok(director.includes("entry.shieldConsumed ? 'shieldImpact'"),'shield substitutes only that impact SFX');
assert.ok(director.includes("entry.indestructibleSurvived ? 'indestructibleImpact'"),'indestructible substitutes only that impact SFX');
assert.ok(director.includes("entry.deathtouchHit ? 'deathtouchImpact'"),'deathtouch substitutes only that impact SFX');

// Tano parity: mana taps already emit semantic permanent_tapped events; Animation Director now consumes them.
assert.ok(bot.includes("cause:'mana_ability'"),'Tano mana tapping emits mana_ability event');
assert.ok(director.includes("type==='permanent_tapped' && event.cause==='mana_ability'"),'Animation Director bridges any actor mana tap');
assert.ok(director.includes("captureCardVisual(event.item,isLocal?'local':'rival'"),'mana tap bridge preserves local/rival actor perspective');
assert.ok(!main.includes('queueLandTapAnimation({snapshot:landTapAnimationSnapshot'),'human path no longer double-enqueues land animation');

// Multiplayer presentation channel: each client publishes ONLY its own cue ring.
const hostCue={id:'pc_host_1',kind:'land_tap',emitterRole:'host'};
const guestCue={id:'pc_guest_1',kind:'land_tap',emitterRole:'guest'};
const baseState={
  activePlayer:'local', priorityPlayer:'local', stackResolutionAuthority:true,
  localHand:[],localDeck:[],rivalHand:[],rivalDeck:[],
  localPresentationCues:[hostCue], rivalPresentationCues:[guestCue]
};
const hostPatch=buildMyPublicPatch(baseState,'host',[]);
assert.deepEqual(hostPatch.hostPresentationCues,[hostCue]);
assert.equal(Object.prototype.hasOwnProperty.call(hostPatch,'guestPresentationCues'),false,'authority must never republish rival cue ring');
const guestPatch=buildMyPublicPatch({...baseState,localPresentationCues:[guestCue],rivalPresentationCues:[hostCue]},'guest',[]);
assert.deepEqual(guestPatch.guestPresentationCues,[guestCue]);
assert.equal(Object.prototype.hasOwnProperty.call(guestPatch,'hostPresentationCues'),false,'guest must never republish host cue ring');
assert.deepEqual(extractRivalStateFromPublicDoc({guestPresentationCues:[guestCue]},'host',new Set(['guestPresentationCues'])).rivalPresentationCues,[guestCue]);
assert.deepEqual(extractMyStateFromPublicDoc({hostPresentationCues:[hostCue]},'host',new Set(['hostPresentationCues'])).localPresentationCues,[hostCue]);

assert.ok(main.includes('const PRESENTATION_CUE_RING_LIMIT = 24'),'bounded presentation cue ring');
assert.ok(main.includes('setPresentationCueEmitter((draft) =>'),'runtime emitter installed');
assert.ok(main.includes('preparePresentationCuePlayback(cue,myRole)'),'remote cue translated into local/rival perspective');
assert.ok(main.includes('handledPresentationCueIds.add(cue.id)'),'remote cues deduplicated');
assert.ok(main.includes('void playback()'),'remote playback starts after authoritative state render');
assert.ok(director.includes('broadcast:false,remoteCue:true'),'remote playback cannot echo back');
assert.ok(director.includes("cue.zoneFrom==='library'&&cue.zoneTo==='hand'") || main.includes("cue.zoneFrom === 'library' && cue.zoneTo === 'hand'"),'private draws hide card identity on public cue');

// CI retention: cleanup must not delete the new contract and CI must execute it explicitly.
assert.ok(workflow.includes('test_animation_actor_parity_sfx_cues_23_19_4_5.mjs'),'CI whitelist retains v23.19.4.5 test');
assert.ok(workflow.includes('Validate Animation Actor Parity + SFX Cue Semantics 23.19.4.5'),'CI runs v23.19.4.5 contract');

console.log('ANIMATION_ACTOR_PARITY_SFX_CUES_23_19_4_5_OK');
console.log('actors=player+tano+host+guest presentation-cues=role-owned-deduped-no-echo');
console.log('sfx=start-or-key cadence=single-or-per-impact multi-xN=N-key-cues audio-targets=runtime-catalog-opus+mp3');
console.log('pool=880 protocol=mp-23.19.2 rules=23.13.80 unchanged');
