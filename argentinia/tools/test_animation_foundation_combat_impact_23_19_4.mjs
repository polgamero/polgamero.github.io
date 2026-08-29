import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeAnimationSettings,
  animationDuration,
  applyServerAnimationPolicy,
  getServerAnimationPolicy,
  getAnimationSettings,
  ANIMATION_SPEED_MULTIPLIERS
} from '../js/animationDirector.js';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { POOL_BASELINE } from '../js/poolContract.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const need = (cond, msg) => { if (!cond) throw new Error(`ANIMATION_23_19_4_FAIL:${msg}`); };

need(ENGINE_VERSION === '23.19.4', `engine=${ENGINE_VERSION}`);
need(ENGINE_PROTOCOL_VERSION === 'mp-23.19.1', `protocol=${ENGINE_PROTOCOL_VERSION}`);
need(FIRESTORE_RULES_VERSION === '23.13.77', `rules=${FIRESTORE_RULES_VERSION}`);
need(POOL_BASELINE.total === 880, `pool=${POOL_BASELINE.total}`);

const normalized = normalizeAnimationSettings({ enabled:false, speed:'fast' });
need(normalized.enabled === false && normalized.speed === 'fast', 'settings-normalization');
need(ANIMATION_SPEED_MULTIPLIERS.slow > 1 && ANIMATION_SPEED_MULTIPLIERS.fast < 1, 'speed-multipliers');
const normalDuration = animationDuration(1000);
need(normalDuration > 0, 'duration-positive');
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
need(director.includes('queueCombatImpactAnimation') && director.includes('queuePlayerDamageAnimation') && director.includes('queueLandTapAnimation'), 'director-event-contract');
need(director.includes('prefers-reduced-motion: reduce'), 'reduced-motion');
need(director.includes('ghostNodes'), 'ghost-diagnostics');
need(director.includes('arg-game-animation-layer'), 'isolated-layer');
need(director.includes('runAnimationDebugShowcase'), 'admin-animation-lab');

need(main.includes('captureCardVisual(item') && main.includes('queueLandTapAnimation'), 'land-tap-hook');
need(combat.includes('oneVsOneVisual') && combat.includes('aliveBlockers.length === 1') && combat.includes('!attackerHasTrample'), 'combat-1v1-scope');
need(combat.includes('queueCombatImpactAnimation') && combat.includes('defenderDied:willCreatureLeaveFromCombatLethal') && combat.includes("!hasKeyword(item, 'indestructible')"), 'combat-death-visual');
need(combat.includes('queuePlayerDamageAnimation') && combat.includes('capturePlayerVisual'), 'direct-player-impact');

need(audio.includes('./assets/sounds/sfx/choque.opus') && audio.includes('./assets/sounds/sfx/choque.mp3'), 'impact-sfx');
need(audio.includes('./assets/sounds/sfx/tierra.opus') && audio.includes('./assets/sounds/sfx/tierra.mp3'), 'land-sfx');
need(audio.includes('./assets/sounds/sfx/golpe_jugador.opus') && audio.includes('./assets/sounds/sfx/golpe_jugador.mp3'), 'player-sfx');

need(ui.includes('opt-animations-toggle') && ui.includes('opt-animation-speed'), 'options-real-animation-controls');
need(ui.includes('admin-animation-policy-save') && ui.includes('admin-animation-test'), 'admin-kill-switch-and-lab');
need(texts.includes("'options.animations.serverOff'"), 'options-server-off-copy');

need(firebaseImpl.includes("loadPublicGameConfigDocument('animations')"), 'animation-policy-document');
need(firebaseImpl.includes("doc(db, 'gameConfig', 'animations')") && firebaseImpl.includes('onSnapshot'), 'animation-policy-live-listener');
need(firebaseFacade.includes('listenAnimationPolicy') && firebaseFacade.includes('saveAnimationPolicy'), 'animation-policy-lazy-facade');

need(manifest.engineVersion === '23.19.4' && manifest.firestoreRulesVersion === '23.13.77' && manifest.pool === 880, 'build-manifest');

console.log('ANIMATION_FOUNDATION_COMBAT_IMPACT_23_19_4_OK');
console.log('director=isolated+queue+cleanup');
console.log('settings=user-toggle+speed+server-live-kill-switch+reduced-motion');
console.log('combat=1v1+death+player-impact');
console.log('land=tap-force+dust');
console.log('sfx=choque+tierra+golpe_jugador opus/mp3');
console.log('admin=kill-switch+animation-lab');
console.log('pool=880 protocol=mp-23.19.1 rules=23.13.77');
