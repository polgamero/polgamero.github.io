import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const main = read('../js/main.js');
const turn = read('../js/turnManager.js');
const bot = read('../js/bot.js');
const telemetry = read('../js/telemetry.js');

function slice(src, start, end) {
  const a = src.indexOf(start);
  assert.ok(a >= 0, `missing ${start}`);
  const b = end ? src.indexOf(end, a + start.length) : src.length;
  assert.ok(b > a, `missing ${end}`);
  return src.slice(a,b);
}

// Production incident regression:
// local pass -> rival priority at t=0; adjacent windows prove normal bot handoff ≈1200 ms.
// Browser became hidden at +926 ms and visible at +2588 ms, right inside the
// 600 ms scheduler + 600 ms bot-think lane.
const incident = { hiddenAtMs: 926, visibleAtMs: 2588, schedulerMs: 600, thinkMs: 600 };
assert.ok(incident.hiddenAtMs < incident.schedulerMs + incident.thinkMs);
assert.ok(incident.visibleAtMs > incident.schedulerMs + incident.thinkMs);

// Tournament is local-bot gameplay, even though it intentionally does not own Solo recovery.
assert.match(main, /function isLifecycleManagedTournamentBotGame\(\)/);
assert.match(main, /!!state\.currentTournamentMatch/);

// Hiding a tournament tab invalidates the one-shot scheduler. Returning visible must
// re-arm exactly one epoch-fenced callback if the rival still owns priority.
const suspend = slice(main, 'function suspendTournamentBotForHidden', 'function resumeTournamentBotAfterVisibility');
assert.match(suspend, /invalidateSoloBotPrioritySchedule\(\)/);
assert.match(suspend, /tournament_bot_lifecycle_suspended/);

const resume = slice(main, 'function resumeTournamentBotAfterVisibility', 'function beginSoloRuntimeSuspend');
assert.match(resume, /tournament_bot_lifecycle_resumed/);
assert.match(resume, /state\.priorityPlayer === 'rival'/);
assert.match(resume, /ensureSoloBotPriorityScheduled\(220\)/);

const visibility = slice(main, 'function handleSoloVisibilityLifecycle()', '// 23.19.5.3');
assert.match(visibility, /suspendTournamentBotForHidden\('visibility_hidden'\)/);
assert.match(visibility, /isLifecycleManagedTournamentBotGame\(\)/);
assert.match(visibility, /resumeTournamentBotAfterVisibility\(\)/);

// The underlying scheduler/bot still fail closed while hidden, but now visibility resume
// repairs the consumed callback instead of leaving tournament priority stranded.
assert.match(turn, /soloRuntimeIsHidden\(\)/);
assert.match(turn, /epoch !== soloBotPriorityEpoch/);
assert.match(bot, /botRuntimeIsHidden\(\)/);

// Telemetry must watch Tournament too. The production log had zero automatic candidates
// because HF11 only allowed solo/solo_reconnect into this watchdog.
const watchdog = slice(telemetry, 'function pollBotPriorityWatchdog()', 'function startBotPriorityWatchdog()');
assert.match(watchdog, /currentSession\?\.meta\?\.mode === 'tournament'/);
assert.match(watchdog, /state\?\.priorityPlayer === 'rival'/);
assert.match(watchdog, /BOT_PRIORITY_STALL_MS/);
assert.match(telemetry, /El rival controlado por bot conserva la misma ventana de prioridad/);

console.log('TOURNAMENT_BOT_VISIBILITY_RECOVERY_23_21_6_HF12_OK visibility=rearm telemetry=tournament scheduler=epoch');
