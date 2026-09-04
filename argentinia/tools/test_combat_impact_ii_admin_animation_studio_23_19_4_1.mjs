import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { applyServerAnimationPolicy, animationDuration, normalizeAnimationSpeedMultipliers } from '../js/animationDirector.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const combat=read('js/combatRules.js');
const director=read('js/animationDirector.js');
const ui=read('js/ui.js');
const firebase=read('js/firebaseClientImpl.js');
const manifest=JSON.parse(read('build-manifest.json'));

assert.equal(ENGINE_VERSION,'23.19.5.5');
assert.equal(ENGINE_PROTOCOL_VERSION,'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(manifest.engineVersion,'23.19.5.5');
assert.equal(manifest.pool,880);

const refs=normalizeAnimationSpeedMultipliers({slow:1.6,normal:.95,fast:.55});
assert.deepEqual(refs,{slow:1.6,normal:.95,fast:.55});
applyServerAnimationPolicy({enabled:true,speedMultipliers:refs},'test-23.19.5');
assert.equal(animationDuration(1000,'slow'),1600);
assert.equal(animationDuration(1000,'normal'),950);
assert.equal(animationDuration(1000,'fast'),550);

assert.match(combat,/combatVisual = attackerDealsThisStep && aliveBlockers\.length > 0/);
assert.match(combat,/defenders:aliveBlockers\.map/);
assert.match(combat,/shieldBefore/);
assert.match(combat,/shieldConsumed:entry\.shieldBefore > shieldAfter/);
assert.match(combat,/deathtouchHit:attackerHasDeathtouch && entry\.damageDealt > 0/);
assert.match(combat,/indestructibleSurvived/);
assert.match(combat,/stepKind = stepFilter === dealsInFirstStrikeStep \? 'first_strike' : 'regular'/);
assert.match(combat,/doubleStrikePass:stepKind === 'regular' && hasKeyword\(attacker,'doublestrike'\)/);
assert.match(combat,/playerDamage:damageToPlayerThisStep/);

for (const token of ['Multi ×3','Arrollar','Iniciativa','Dos golpes','Escudo','Letal','Irrompible']) assert.ok(director.includes(token),`lab:${token}`);
assert.ok(director.includes("background:#0b130e url('./assets/images/ui/fondo.png')"),'real-board-background');
assert.ok(director.includes('grid-template-columns:minmax(0,1fr) 19%'),'board-plus-sidebar-geometry');
assert.ok(director.includes('data-animation-lab-speed'),'lab-speed-select');
assert.ok(director.includes('speedOverride'),'isolated-lab-speed');
assert.ok(director.includes('arg-anim-shield-burst'),'shield-visual');
assert.ok(director.includes('arg-anim-indestructible-burst'),'indestructible-visual');
assert.ok(director.includes("variant === 'deathtouch'"),'deathtouch-visual');

assert.ok(ui.includes("data-admin-pane=\"animations\""),'animation-pane');
assert.ok(ui.includes("label: 'ANIMACIONES'"),'animation-tab');
assert.ok(ui.includes('admin-animation-speed-grid'),'server-speed-editor');
assert.ok(ui.includes('Lenta ≥ Normal ≥ Rápida'),'speed-order-guard');
assert.ok(ui.includes('Animation Test Lab · dummy del tablero real'),'dummy-board-copy');
assert.ok(!ui.includes('id="admin-animation-test"'),'old-tiny-test-button-removed');

assert.ok(/schemaVersion:\s*[234567]/.test(firebase),'policy-schema-v2+');
assert.ok(firebase.includes('speedMultipliers:'),'policy-speed-map');
assert.ok(firebase.includes('Math.max(0.25, Math.min(3'),'policy-speed-clamp');

console.log('COMBAT_IMPACT_II_ADMIN_ANIMATION_STUDIO_23_19_4_1_OK');
console.log('combat=multi-block+trample+first-strike+double-strike+shield+deathtouch+indestructible');
console.log('admin=dedicated-tab+server-speed-reference+full-board-dummy+lab-speed-override');
console.log('rules=23.13.79 unchanged protocol=mp-23.19.2 pool=880');
