import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const main = read('../js/main.js');
const turn = read('../js/turnManager.js');
const bot = read('../js/bot.js');
const combat = read('../js/combatRules.js');
const recovery = read('../js/soloRecovery.js');
const telemetry = read('../js/telemetry.js');
const texts = read('../js/gameTexts.js');

function functionSlice(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = endMarker ? src.indexOf(endMarker, start + startMarker.length) : src.length;
  assert.ok(end > start, `missing end marker ${endMarker}`);
  return src.slice(start, end);
}

// Incident regression: declaration triggers must be fully materialized/ordered BEFORE priority
// is handed to the opponent. Otherwise a pending trigger-order modal can consume the one-shot
// Tano callback and leave rival priority stranded with the newly created Stack.
const localAttack = functionSlice(combat, 'export async function executeLocalAttack()', 'export async function executeRivalAttack()');
const localWait = localAttack.indexOf('await waitForTriggerOrdering()');
const localPass = localAttack.indexOf("await passPriority('local')");
assert.ok(localWait >= 0 && localPass > localWait, 'local attack triggers must finish ordering before local passes priority');

const rivalAttack = functionSlice(combat, 'export async function executeRivalAttack()', '// --- GOLPE PRIMERO');
assert.match(rivalAttack, /queueDeclaredBlockTriggers\(state\.localCombat, true\);[\s\S]*?await waitForTriggerOrdering\(\);[\s\S]*?beginActivePlayerPriorityWindow\(\);/);

// Bot-side attack/block declarations obey the same atomic trigger-batch contract.
assert.match(bot, /queueDeclaredAttackTriggers\(declaredAttackers, false\);[\s\S]*?await waitForTriggerOrdering\(\);[\s\S]*?await passPriority\('rival'\);/);
assert.match(bot, /queueDeclaredBlockTriggers\(state\.rivalCombat, false\);[\s\S]*?await waitForTriggerOrdering\(\);/);

// The Tano scheduler is single-owner + epoch-fenced and refuses to fire through lifecycle,
// trigger-order, SBA, or interactive-resolution blockers.
assert.match(turn, /let soloBotPriorityTimer = null;/);
assert.match(turn, /let soloBotPriorityEpoch = 0;/);
assert.match(turn, /export function invalidateSoloBotPrioritySchedule\(\)/);
assert.match(turn, /export function scheduleSoloBotPriority\(delayMs = 600\)/);
assert.match(turn, /epoch !== soloBotPriorityEpoch/);
assert.match(turn, /state\.soloRuntimeSuspended/);
assert.match(turn, /state\.pendingTriggerOrderChoice/);
assert.match(turn, /hasSoloInteractiveResolutionPending\(\)/);

// Mobile lifecycle: hidden freezes Solo; short thaw soft-resumes; >=2 min reloads into the
// existing recovery flow and bypasses the normal beforeunload abandonment confirmation.
assert.match(main, /const SOLO_LONG_SUSPEND_MS = 2 \* 60 \* 1000;/);
assert.match(main, /document\.addEventListener\('visibilitychange', handleSoloVisibilityLifecycle\);/);
assert.match(main, /suspendSoloRecoverySession\(state, spellStack/);
assert.match(main, /resumeSoloRecoverySession\(\)/);
assert.match(main, /hiddenForMs >= SOLO_LONG_SUSPEND_MS/);
assert.match(main, /showMatchInitializationOverlay\(gameText\('solo\.lifecycle\.reloading'\)\)/);
assert.match(main, /window\.location\.reload\(\)/);
assert.match(main, /if \(state\.gameOver \|\| state\.soloLifecycleReloading\) return;/);
assert.match(main, /ensureSoloBotPriorityScheduled\(220\)/);

// Recovery duration must not accumulate background time. Stable checkpoints are frozen; an
// unstable modal keeps the previous stable gameplay snapshot and updates only lifecycle metadata.
assert.match(recovery, /const live = active\.suspended \? 0 : Math\.max\(0, atMs - active\.segmentStartedAtMs\);/);
assert.match(recovery, /export function suspendSoloRecoverySession/);
assert.match(recovery, /active\.activeElapsedBaseMs = effectiveElapsedMs;/);
assert.match(recovery, /active\.suspended = true;/);
assert.match(recovery, /if \(isSoloRecoveryStable\(state\)\)/);
assert.match(recovery, /candidate\.runtimeSuspended = true;/);
assert.match(recovery, /export function resumeSoloRecoverySession/);
assert.match(recovery, /active\.segmentStartedAtMs = resumedAtMs;/);

// Telemetry observes rather than repairs. It pauses in background/grace, and it can now detect
// rival-priority stalls even when the Stack is NON-empty (the production incident had depth 2).
assert.match(telemetry, /pageHidden \|\| state\?\.soloRuntimeSuspended \|\| lifecycleGraceUntil > now/);
const watchdog = functionSlice(telemetry, 'function pollBotPriorityWatchdog()', 'function startBotPriorityWatchdog()');
assert.match(watchdog, /state\?\.priorityPlayer === 'rival'/);
assert.doesNotMatch(watchdog, /stack\.length\s*===\s*0/);
assert.match(watchdog, /stackLength: stack\.length/);

assert.match(texts, /'solo\.lifecycle\.reloading': definition\('Partida', 'Reanudando partida suspendida…'/);

console.log('MOBILE_LIFECYCLE_TRIGGER_STACK_23_21_6_HF6_OK triggerOrder=atomic tanoScheduler=epoch lifecycle=2m recovery=active-time telemetry=stack-aware');
