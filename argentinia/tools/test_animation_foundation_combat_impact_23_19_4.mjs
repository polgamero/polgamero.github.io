import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeAnimationSettings,
  animationDuration,
  applyServerAnimationPolicy,
  getServerAnimationPolicy,
  getAnimationSettings,
  ANIMATION_SPEED_MULTIPLIERS,
  normalizeAnimationSpeedMultipliers
} from '../js/animationDirector.js';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { POOL_BASELINE } from '../js/poolContract.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const need = (cond, msg) => { if (!cond) throw new Error(`ANIMATION_23_19_4_FAIL:${msg}`); };

need(ENGINE_VERSION === '23.19.5.4', `engine=${ENGINE_VERSION}`);
need(ENGINE_PROTOCOL_VERSION === 'mp-23.19.2', `protocol=${ENGINE_PROTOCOL_VERSION}`);
need(FIRESTORE_RULES_VERSION === '23.13.79', `rules=${FIRESTORE_RULES_VERSION}`);
need(POOL_BASELINE.total === 880, `pool=${POOL_BASELINE.total}`);

const normalized = normalizeAnimationSettings({ enabled:false, speed:'fast' });
need(normalized.enabled === false && normalized.speed === 'fast', 'settings-normalization');
need(ANIMATION_SPEED_MULTIPLIERS.slow > 1 && ANIMATION_SPEED_MULTIPLIERS.fast < 1, 'speed-multipliers');
need(normalizeAnimationSpeedMultipliers({slow:9,normal:1,fast:.01}).slow === 3, 'server-speed-clamp-high');
need(normalizeAnimationSpeedMultipliers({slow:1.4,normal:1,fast:.6}).fast === .6, 'server-speed-normalize');
applyServerAnimationPolicy({ enabled:true, speedMultipliers:{slow:1.5,normal:1,fast:.5} }, 'test');
need(animationDuration(1000,'slow') === 1500, 'server-slow-reference');
need(animationDuration(1000,'fast') === 500, 'server-fast-reference');
need(getServerAnimationPolicy().speedMultipliers.normal === 1, 'server-speed-policy');
applyServerAnimationPolicy({ enabled:false }, 'test');
need(getServerAnimationPolicy().enabled === false, 'server-kill-switch-off');
applyServerAnimationPolicy({ enabled:true }, 'test');
need(getServerAnimationPolicy().enabled === true, 'server-kill-switch-on');
need(['slow','normal','fast'].includes(getAnimationSettings().speed), 'local-speed-valid');

const director = read('js/animationDirector.js');
const main = read('js/main.js');
const combat = read('js/combatRules.js');
const ui = read('js/ui.js');
const audio = read('js/audioManager.js');
const firebaseImpl = read('js/firebaseClientImpl.js');
const firebaseFacade = read('js/firebaseClient.js');
const texts = read('js/gameTexts.js');
const manifest = JSON.parse(read('build-manifest.json'));

need(!director.includes("from './main.js'"), 'director-must-not-import-engine-state');
need(director.includes('queueCombatImpactAnimation') && director.includes('queuePlayerDamageAnimation') && director.includes('queueLandTapAnimation'), 'director-foundation-events');
need(director.includes('queueCombatSequenceAnimation'), 'combat-impact-II-event');
need(director.includes('prefers-reduced-motion: reduce'), 'reduced-motion');
need(director.includes('ghostNodes'), 'ghost-diagnostics');
need(director.includes('arg-game-animation-layer'), 'isolated-layer');
need(director.includes('mountAnimationLab') && director.includes('arg-animation-lab-board-shell'), 'admin-animation-studio');

need(main.includes("type:'permanent_tapped'") && director.includes("event.cause==='mana_ability'") && director.includes('queueLandTapAnimation({snapshot,isLocal}'), 'land-tap-hook-semantic-bridge');
need(combat.includes('combatVisual.defenders') && combat.includes('queueCombatSequenceAnimation'), 'combat-multi-sequence');
need(combat.includes('shieldConsumed') && combat.includes('indestructibleSurvived') && combat.includes('deathtouchHit'), 'combat-keyword-visuals');
need(combat.includes("stepKind === 'regular' && hasKeyword(attacker,'doublestrike')"), 'double-strike-pass');
need(combat.includes('damageToPlayerThisStep > 0 ? combatVisual.playerSnapshot : null'), 'trample-to-player-sequence');
need(combat.includes('queuePlayerDamageAnimation') && combat.includes('capturePlayerVisual'), 'direct-player-impact');

need(audio.includes('./assets/sounds/sfx/choque.opus') && audio.includes('./assets/sounds/sfx/choque.mp3'), 'impact-sfx');
need(audio.includes('./assets/sounds/sfx/tierra.opus') && audio.includes('./assets/sounds/sfx/tierra.mp3'), 'land-sfx');
need(audio.includes('./assets/sounds/sfx/golpe_jugador.opus') && audio.includes('./assets/sounds/sfx/golpe_jugador.mp3'), 'player-sfx');

need(ui.includes("{ key: 'animations', label: 'ANIMACIONES' }"), 'dedicated-admin-animation-tab');
need(ui.includes('cfg-animation-speed-slow') && ui.includes('cfg-animation-speed-normal') && ui.includes('cfg-animation-speed-fast'), 'admin-speed-references');
need(ui.includes('mountAnimationLab') && ui.includes('admin-animation-lab-root'), 'admin-lab-mounted');
need(ui.includes('opt-animations-toggle') && ui.includes('opt-animation-speed'), 'options-real-animation-controls');
need(texts.includes("'options.animations.serverOff'"), 'options-server-off-copy');

need(firebaseImpl.includes("loadPublicGameConfigDocument('animations')"), 'animation-policy-document');
need(firebaseImpl.includes('speedMultipliers') && /schemaVersion:\s*[234567]/.test(firebaseImpl), 'animation-policy-speed-schema');
need(firebaseImpl.includes("doc(db, 'gameConfig', 'animations')") && firebaseImpl.includes('onSnapshot'), 'animation-policy-live-listener');
need(firebaseFacade.includes('listenAnimationPolicy') && firebaseFacade.includes('saveAnimationPolicy'), 'animation-policy-lazy-facade');

need(manifest.engineVersion === '23.19.5.4' && manifest.firestoreRulesVersion === '23.13.79' && manifest.pool === 880, 'build-manifest');

console.log('ANIMATION_FOUNDATION_COMBAT_IMPACT_23_19_4_OK');
console.log('director=isolated+queue+cleanup+server-speed-references');
console.log('settings=user-toggle+speed+server-live-kill-switch+reduced-motion');
console.log('combat=1v1+multi+trample+first/double+shield+deathtouch+indestructible');
console.log('land=tap-force+dust');
console.log('admin=dedicated-animation-tab+full-board-dummy+lab-speed-selector');
console.log('pool=880 protocol=mp-23.19.2 rules=23.13.79');
