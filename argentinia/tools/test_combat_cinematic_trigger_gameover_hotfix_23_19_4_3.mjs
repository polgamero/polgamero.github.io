import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const stack=read('js/stackManager.js');
const bot=read('js/bot.js');
const combat=read('js/combatRules.js');
const director=read('js/animationDirector.js');
const telemetry=read('js/telemetry.js');
const turns=read('js/turnManager.js');
const ui=read('js/ui.js');
const html=read('index.html');
const texts=read('js/gameTexts.js');
const manifest=JSON.parse(read('build-manifest.json'));

assert.equal(ENGINE_VERSION,'23.19.4.4');
assert.equal(ENGINE_PROTOCOL_VERSION,'mp-23.19.1');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(manifest.engineVersion,'23.19.4.4');
assert.equal(manifest.pool,880);

// Real-game bug #1: same ETB event => watchers + the entering creature's own ETB in ONE AP/NAP batch.
assert.match(stack,/const simultaneousCreatureEtb = collectCreatureEtbBatchEntries\(isLocal, \[\{ card, item:newPermanentItem \}\]\)/);
assert.match(stack,/if \(card\.etbEffect\) \{[\s\S]*simultaneousCreatureEtb\.push\(/);
assert.match(stack,/queueTriggeredAbilities\(simultaneousCreatureEtb\)/);
assert.match(stack,/if \(card\.etbEffect && card\.power === undefined\)/,'creature ETB must not be queued a second time');

// Real-game bug #4: a bot permanent cannot put the same activated ability on Stack twice while first copy is pending.
assert.match(bot,/function hasPendingBotActivatedAbility\(sourceItem, abilityIndex\)/);
assert.ok((bot.match(/hasPendingBotActivatedAbility\(/g)||[]).length>=3,'helper + both activation paths');
assert.match(bot,/sameBotAbilitySource\(entry\?\.sourceItem, sourceItem\)/);

// Real-game bugs #2/#3/#6: visual sequence is awaited before SBA/game-over render.
assert.doesNotMatch(combat,/void queuePlayerDamageAnimation\(/);
assert.doesNotMatch(combat,/void queueCombatSequenceAnimation\(/);
assert.ok((combat.match(/await queuePlayerDamageAnimation\(/g)||[]).length>=2,'direct + all-trample impacts must be awaited');
assert.match(combat,/await queueCombatSequenceAnimation\(/);
assert.match(combat,/playerHpBefore:/);
assert.match(combat,/playerHpAfter:/);
assert.match(director,/updatePlayerHpPresentation\(/);
assert.match(director,/arg-anim-source-hidden/);
assert.match(director,/hideOriginalVisual\(entry\.snapshot\)/);

// Real-game bug #5: destructive pending target has an explicit board-level instruction.
assert.match(ui,/function renderResolvedEffectTargetHint\(\)/);
assert.match(ui,/target\.resolved\.exileCreature/);
assert.match(ui,/renderResolvedEffectTargetHint\(\)/);
assert.match(texts,/elegí una criatura para EXILIAR/);

// Real-game bug #6: terminal manual mark + settlement can refresh an already-uploaded final.
assert.match(telemetry,/forceFinalRefresh/);
assert.match(telemetry,/manual_bug_marker'[\s\S]*forceFinalRefresh: !!currentSession\?\.endedAt/);
assert.match(telemetry,/refreshFinalTelemetryAfterTerminalEvent/);
assert.match(turns,/refreshFinalTelemetryAfterTerminalEvent\('game_reward_settled'\)/);
assert.match(turns,/refreshFinalTelemetryAfterTerminalEvent\('game_reward_deferred'\)/);

// Game-over modal says what it actually does and shows Solo reward status.
assert.match(html,/<button id="btn-restart">Volver al menú principal<\/button>/);
assert.match(ui,/game\.points\.botChecking/);
assert.match(turns,/showGameRewardStatus\(msg, 'success'\)/);
assert.match(turns,/showGameRewardStatus\(gameText\('game\.points\.deferred'\), 'warning'\)/);

console.log('COMBAT_CINEMATIC_TRIGGER_GAMEOVER_HOTFIX_23_19_4_3_OK');
console.log('triggerOrder=simultaneous-ETB-APNAP botAbilityReservation=PASS combatPresentation=awaited+progressive-hp+impact-death');
console.log('targetUX=effect-aware gameOver=reward-visible+correct-menu-label telemetry=postgame-final-refresh');
console.log('pool=880 protocol=mp-23.19.1 rules=23.13.79 unchanged');
