import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import {
  applyServerAnimationPolicy,
  animationTunedDuration,
  getAnimationTuning,
  getAnimationTuningCatalog,
  normalizeAnimationTunings
} from '../js/animationDirector.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const director=read('js/animationDirector.js');
const ui=read('js/ui.js');
const firebase=read('js/firebaseClientImpl.js');
const manifest=JSON.parse(read('build-manifest.json'));
const workflow=fs.readFileSync(path.join(root,'..','.github','workflows','pages.yml'),'utf8');

assert.ok(/^23\.19\.4\.(?:4|[5-9]|[1-9]\d+)$/.test(ENGINE_VERSION) || ENGINE_VERSION === '23.19.5.2',`23.19.4.4+ cumulative engine expected, got ${ENGINE_VERSION}`);
assert.ok(/^mp-23\.19\.(?:1|[2-9]|[1-9]\d+)$/.test(ENGINE_PROTOCOL_VERSION),`mp-23.19.1+ expected, got ${ENGINE_PROTOCOL_VERSION}`);
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(manifest.engineVersion,ENGINE_VERSION);
assert.equal(manifest.firestoreRulesVersion,'23.13.79');
assert.equal(manifest.pool,880);
assert.ok(['Store / Craft / Prebuilt / Classifieds / Username Authority + Packs / Cofre / Mythic + Deck Intelligence 2.0','Packs / Cofre / Mythic Authority + Deck Intelligence 2.0','Animation Tuning Matrix + Draggable Test Console','Animation Actor Parity + SFX Cue Semantics','Animation Actor Parity + SFX Cue Semantics + Admin Audio Targets','Rules Integrity + Combat UX + Bot Tactical Hotfix','Core Gameplay Feedback Expansion','Mass Event Cinematics + High-Impact Feedback','Commercial IP Remediation Wave 1 — Identity Clean-room','Commercial IP Remediation Wave 2 — Envase Hermético','Commercial IP Remediation Wave 3 — Venues + Institutions Genericization','Commercial IP Remediation — Residual YELLOW Closure','Global Terminology Clean-room — Owner Dictionary 44/44','Commercial Readiness Closure + Clean-room Verification','Semidiós Rules Text + Creencia UX Hotfix','Economy Authority Foundation + Secure Account Bootstrap','Economy Authority Foundation + Deck/Admin/Land UX Stabilization RC2'].includes(manifest.label));
assert.ok(workflow.includes('test_animation_tuning_matrix_draggable_console_23_19_4_4.mjs'),'CI must retain and execute the 23.19.4.4 contract');
assert.ok(workflow.includes('Validate Animation Tuning Matrix + Draggable Test Console 23.19.4.4'),'CI gate label');

const catalog=getAnimationTuningCatalog();
assert.ok(catalog.length>=18,'all historical Animation Studio scenarios must remain tuneable');
assert.equal(new Set(catalog.map(entry=>entry.key)).size,catalog.length,'tuning keys unique');
for(const key of ['land','clash','multi','trample','first','double','shield','deathtouch','indestructible','player','counter','exile','bounce','draw','discard','sacrifice','graveyard','reanimate']) {
  assert.ok(catalog.some(entry=>entry.key===key),`catalog:${key}`);
}

const defaults=normalizeAnimationTunings({});
assert.deepEqual(defaults.land,{relativeSpeed:1,relativeVolume:1,sfxMoment:'start',sfxCadence:'single'});
assert.deepEqual(defaults.clash,{relativeSpeed:1,relativeVolume:1,sfxMoment:'key',sfxCadence:'per_impact'});
assert.deepEqual(defaults.player,{relativeSpeed:1,relativeVolume:1,sfxMoment:'key',sfxCadence:'per_impact'});
assert.deepEqual(defaults.exile,{relativeSpeed:1,relativeVolume:1,sfxMoment:'start',sfxCadence:'single'});
const clamped=normalizeAnimationTunings({land:{relativeSpeed:.1,sfxTiming:'end'},clash:{relativeSpeed:8,sfxTiming:'start'}});
assert.equal(clamped.land.relativeSpeed,.25);
assert.equal(clamped.land.sfxMoment,'key','legacy end migrates to key moment');
assert.equal(clamped.clash.relativeSpeed,3);
assert.equal(clamped.clash.sfxMoment,'start');

applyServerAnimationPolicy({
  enabled:true,
  speedMultipliers:{slow:1.35,normal:1,fast:.68},
  animationTunings:{
    land:{relativeSpeed:.75,sfxMoment:'start'},
    clash:{relativeSpeed:1.25,sfxMoment:'key'}
  }
},'qa-23.19.4.4');
assert.deepEqual(getAnimationTuning('land'),{relativeSpeed:.75,relativeVolume:1,sfxMoment:'start',sfxCadence:'single'});
assert.deepEqual(getAnimationTuning('clash'),{relativeSpeed:1.25,relativeVolume:1,sfxMoment:'key',sfxCadence:'per_impact'});
assert.equal(animationTunedDuration(1000,'land','normal'),1333,'0.75 relative speed must be slower, not shorter');
assert.equal(animationTunedDuration(1000,'clash','normal'),800,'1.25 relative speed must be faster');

// Admin matrix: one canonical table, 18 rows, exclusive Inicio/Fin checkboxes, saved in same policy document.
for(const token of ['Ajuste por animación','Velocidad relativa','Ejecución del SFX','>Inicio<','>Momento clave<']) assert.ok(ui.includes(token),`admin table:${token}`);
assert.ok(ui.includes('data-animation-tuning-speed='),'relative speed input');
assert.ok(ui.includes('data-animation-sfx-moment='),'sfx moment input');
assert.ok(ui.includes("if (check.checked) peers.forEach"),'exclusive timing checkbox logic');
assert.ok(ui.includes('const animationTunings = readAnimationTunings()'),'admin reads tuning matrix');
assert.ok(ui.includes('saveAnimationPolicy({ enabled, speedMultipliers, animationTunings })'),'admin saves tuning matrix');
assert.ok(firebase.includes('animationTunings,'),'policy writes per-animation tuning');
assert.ok(/schemaVersion:\s*[34567]/.test(firebase),'policy schema v3+');
assert.ok(firebase.includes("sfxMoment: value.sfxMoment === 'key' ? 'key'"),'moment sanitizer');

// Runtime mapping: relative speed divides global duration; SFX can fire at start or contact/end.
assert.ok(director.includes('globalDuration / Math.max(RELATIVE_SPEED_MIN, relativeSpeed || 1)'),'relative speed semantics');
assert.ok(director.includes("playAnimationSfx('landTap','land','start')"),'land-start hook');
assert.ok(director.includes("playAnimationSfx('landTap','land','key')"),'land-key hook');
assert.ok(director.includes("playAnimationSfx(impactSfx,impactTuningKey,'start')"),'combat-start hook');
assert.ok(director.includes("playAnimationSfx(impactSfx,impactTuningKey,'key')"),'combat-key hook');
assert.ok(director.includes("playAnimationSfx(sfx,zoneTuningKey,'start')"),'zone-start hook');
assert.ok(director.includes("playAnimationSfx(sfx,zoneTuningKey,'key')"),'zone-key hook');

// Test Lab controls now live on top of the board and are draggable with Pointer Events.
assert.ok(director.includes('arg-animation-lab-floating-controls'),'floating console');
assert.ok(director.includes('data-animation-lab-drag-handle'),'drag handle');
assert.ok(director.includes("handle.addEventListener('pointerdown',onDown)"),'pointer down');
assert.ok(director.includes("handle.addEventListener('pointermove',onMove)"),'pointer move');
assert.ok(director.includes("handle.setPointerCapture?.(event.pointerId)"),'pointer capture');
assert.ok(director.includes("panel.style.right='auto'"),'absolute drag positioning');
const boardIndex=director.indexOf('<div class="arg-animation-lab-board-shell">');
const controlsIndex=director.indexOf('<div class="arg-animation-lab-floating-controls"');
const gameIndex=director.indexOf('<div class="arg-animation-lab-game">');
assert.ok(boardIndex>=0 && controlsIndex>boardIndex && gameIndex>controlsIndex,'floating controls must be inside board shell and above game markup');
assert.ok(director.includes('<button data-test="all">Secuencia completa</button>'),'full chain inside console');
assert.ok(director.includes('<button data-test="clear">Limpiar</button>'),'clear inside console');

console.log('ANIMATION_TUNING_MATRIX_DRAGGABLE_CONSOLE_23_19_4_4_OK');
console.log('admin=18-row-tuning-matrix relative-speed=speed-factor sfx=start-or-key cumulative-compatible');
console.log('lab=floating-draggable-console pointer-events full-chain+clear');
console.log(`pool=880 protocol=${ENGINE_PROTOCOL_VERSION} rules=23.13.79 unchanged`);
