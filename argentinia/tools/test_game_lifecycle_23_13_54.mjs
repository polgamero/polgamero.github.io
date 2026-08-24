import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  beginSoloRecoverySession,
  activateResumedSoloRecovery,
  loadSoloRecoveryCandidate,
  restoreSoloRecoveryState,
  clearSoloRecovery,
  getSoloEffectiveElapsedMs,
  isSoloRecoveryExpired,
  isSoloRecoveryStable,
  TELEMETRY_STALE_AFTER_MS
} from '../js/soloRecovery.js';
import { summarizeGlobalTelemetry, summarizePlayerTelemetry, telemetryDurationMs } from '../js/statistics.js';

const storage = new Map();
globalThis.localStorage = {
  getItem:k => storage.has(k) ? storage.get(k) : null,
  setItem:(k,v) => storage.set(k,String(v)),
  removeItem:k => storage.delete(k)
};

const baseState = {
  currentUser:null,userProfile:null,currentMatch:null,authInitialResolved:true,authIdentityReady:true,
  gameOver:false,abandonedBy:null,abandonProcessedLocally:false,botDifficulty:'hard',turnCount:4,phase:'main1',
  activePlayer:'local',priorityPlayer:'local',consecutivePasses:0,
  localHP:17,rivalHP:12,localPoison:0,rivalPoison:0,
  localDeck:[],localHand:[],localLands:[],localCombat:[],localGraveyard:[],localExile:[],localPlaneswalkers:[],localSupport:[],
  rivalDeck:[],rivalHand:[],rivalLands:[],rivalCombat:[],rivalGraveyard:[],rivalExile:[],rivalPlaneswalkers:[],rivalSupport:[],
  activeEffects:[],scheduledReturns:[],combatDamagePrevented:false,
  pendingSpellIndex:null,pendingTargetCard:null,pendingAbilitySource:null,pendingBlockerIndex:null,
  priorityClockDeadlineLocalMs:0,priorityClockRemainingMs:15000,priorityClockPausedLocal:true,priorityClockPauseReasonLocal:'test'
};

beginSoloRecoverySession({ soloGameId:'solo_test', state:baseState, stack:[], deckLabel:'QA', ownerUid:null, playerName:'Gaucho', telemetrySessionId:'game_a' });
const candidate = loadSoloRecoveryCandidate();
assert.equal(candidate.soloGameId, 'solo_test');
assert.equal(candidate.state.turnCount, 4);
assert.equal(candidate.telemetrySessionId, 'game_a');

const restored = structuredClone(baseState);
restored.turnCount = 99;
const stack = restoreSoloRecoveryState(candidate, restored);
assert.equal(restored.turnCount, 4);
assert.deepEqual(stack, []);

activateResumedSoloRecovery({ ...candidate, activeElapsedMs:120000, segmentIndex:1 }, { state:restored, stack:[], telemetrySessionId:'game_b' });
assert.ok(getSoloEffectiveElapsedMs() >= 120000, 'resume debe conservar tiempo efectivo previo');
assert.equal(isSoloRecoveryExpired({ lastCheckpointAt:new Date(Date.now()-25*60*60*1000).toISOString() }), true);
assert.equal(TELEMETRY_STALE_AFTER_MS, 120000);
assert.equal(isSoloRecoveryStable({ ...baseState, pendingSpellIndex:0 }), false, 'pending index 0 no puede checkpointarse');
clearSoloRecovery();

assert.equal(telemetryDurationMs({ effectiveDurationMs:12345, startedAtClient:'2026-01-01T00:00:00Z', endedAtClient:'2026-01-01T08:00:00Z' }), 12345);
const sessions = [
  { id:'seg1', ownerUid:'u', status:'interrupted', soloGameId:'solo_x', startedAtClient:'2026-01-01T00:00:00Z', endedAtClient:'2026-01-01T00:02:00Z', effectiveDurationMs:120000, mode:'solo' },
  { id:'seg2', ownerUid:'u', status:'completed', soloGameId:'solo_x', startedAtClient:'2026-01-01T00:10:00Z', endedAtClient:'2026-01-01T00:13:00Z', effectiveDurationMs:300000, mode:'solo', latestSnapshotJson:JSON.stringify({local:{hp:10,poison:0},rival:{hp:0,poison:0},turn:{}}) }
];
const player = summarizePlayerTelemetry(sessions);
assert.equal(player.gamesPlayed, 1, 'segmento interrumpido no cuenta como partida');
assert.equal(player.totalDurationMs, 300000, 'usa duración efectiva acumulada del segmento final');
const global = summarizeGlobalTelemetry(sessions);
assert.equal(global.totalGames, 1);
assert.equal(global.soloGames, 1);
assert.equal(global.totalDurationMs, 300000);

const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const unload = main.slice(main.indexOf("window.addEventListener('beforeunload'"), main.indexOf("window.addEventListener('pagehide'"));
assert.ok(!unload.includes('awardPoints('), 'F5 no puede aplicar penalidad');
assert.ok(!unload.includes("state.abandonedBy = 'local'"), 'F5 multiplayer no puede fingir abandono');
assert.ok(main.includes('startMultiplayerPresenceHeartbeat(matchId, myRole)'));

const impl = fs.readFileSync(new URL('../js/firebaseClientImpl.js', import.meta.url), 'utf8');
assert.ok(impl.includes('adminCloseStaleTelemetrySessions'));
assert.ok(impl.includes("status: 'interrupted'"));
assert.ok(impl.includes('touchMatchPresence'));

console.log('GAME_LIFECYCLE_23_13_54_OK');
