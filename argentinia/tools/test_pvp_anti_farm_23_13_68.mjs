import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluatePvpRewardEligibility, argentinaDayKeyFromMs, pvpCompletedTurns } from '../js/pvpRewards.js';

const limits = { minRewardMinutes: 3, minCompletedTurns: 4, maxRewardedMatchesPerPairDaily: 5, maxPointsPerDay: 1200 };

let r = evaluatePvpRewardEligibility({ terminalKind:'abandon', durationMs:179999, turnCountAtEnd:5, pairRewardedCount:0, dailyPointsAwarded:0, requestedDelta:120, limits });
assert.equal(r.reason, 'early_abandon');
assert.equal(r.appliedDelta, 0);

r = evaluatePvpRewardEligibility({ terminalKind:'abandon', durationMs:180000, turnCountAtEnd:4, pairRewardedCount:0, dailyPointsAwarded:0, requestedDelta:120, limits });
assert.equal(r.reason, 'early_abandon', 'turnCount=4 significa sólo 3 turnos completos');

r = evaluatePvpRewardEligibility({ terminalKind:'abandon', durationMs:180000, turnCountAtEnd:5, pairRewardedCount:0, dailyPointsAwarded:0, requestedDelta:120, limits });
assert.equal(r.reason, 'rewarded');
assert.equal(r.appliedDelta, 120);

r = evaluatePvpRewardEligibility({ terminalKind:'natural', durationMs:1000, turnCountAtEnd:1, pairRewardedCount:0, dailyPointsAwarded:0, requestedDelta:120, limits });
assert.equal(r.reason, 'rewarded', 'final natural ignora mínimos de tiempo/turnos');

r = evaluatePvpRewardEligibility({ terminalKind:'natural', durationMs:1000, turnCountAtEnd:1, pairRewardedCount:5, dailyPointsAwarded:0, requestedDelta:120, limits });
assert.equal(r.reason, 'pair_limit');
assert.equal(r.appliedDelta, 0);

r = evaluatePvpRewardEligibility({ terminalKind:'natural', durationMs:1000, turnCountAtEnd:1, pairAlreadyRewarded:true, pairRewardedCount:5, dailyPointsAwarded:0, requestedDelta:20, limits });
assert.equal(r.reason, 'rewarded', 'el segundo receipt del mismo match no consume otro slot de pareja');

r = evaluatePvpRewardEligibility({ terminalKind:'natural', durationMs:1000, turnCountAtEnd:1, pairRewardedCount:0, dailyPointsAwarded:1150, requestedDelta:120, limits });
assert.equal(r.reason, 'daily_cap_partial');
assert.equal(r.appliedDelta, 50);

r = evaluatePvpRewardEligibility({ terminalKind:'natural', durationMs:1000, turnCountAtEnd:1, pairRewardedCount:0, dailyPointsAwarded:1200, requestedDelta:120, limits });
assert.equal(r.reason, 'daily_cap');
assert.equal(r.appliedDelta, 0);

assert.equal(pvpCompletedTurns(1), 0);
assert.equal(pvpCompletedTurns(5), 4);
assert.equal(argentinaDayKeyFromMs(Date.UTC(2026,7,25,2,30)), '2026-08-24');
assert.equal(argentinaDayKeyFromMs(Date.UTC(2026,7,25,3,30)), '2026-08-25');

const store = fs.readFileSync(new URL('../js/store.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const fb = fs.readFileSync(new URL('../js/firebaseClientImpl.js', import.meta.url), 'utf8');
const turn = fs.readFileSync(new URL('../js/turnManager.js', import.meta.url), 'utf8');
const version = fs.readFileSync(new URL('../js/version.js', import.meta.url), 'utf8');

for (const token of ['pvpMinRewardMinutes: 3','pvpMinCompletedTurns: 4','pvpMaxRewardedMatchesPerPairDaily: 5','pvpMaxPointsPerDay: 1200']) assert.ok(store.includes(token), `falta default ${token}`);
assert.ok(ui.includes("section: 'PUNTOS Y LÍMITES DIARIOS'"));
assert.ok(turn.includes('game.points.pvpEarlyNoReward'));
assert.ok(fb.includes('bothReadyAt = serverTimestamp()') || fb.includes('patch.bothReadyAt = serverTimestamp()'));
const matchServer = fs.readFileSync(new URL('../../functions/src/economy/matches.js', import.meta.url), 'utf8');
assert.ok(matchServer.includes("db.collection('pvpDailyPairs')"));
assert.ok(matchServer.includes("db.collection('pvpDailyUsers')"));
assert.ok(!fb.includes("doc(db, 'pvpDailyPairs'"), '23.19.5.6 browser must not write PvP ledgers');
assert.ok(!fb.includes("doc(db, 'pvpDailyUsers'"), '23.19.5.6 browser must not write PvP ledgers');
assert.ok(fb.includes('sealMultiplayerOutcome'));
assert.ok(fb.includes('terminalPatch.bothReadyAt = serverTimestamp()'), 'falta compat bothReadyAt para matches legacy ya Ready');
assert.ok(fb.includes('hostDeckedOut') && fb.includes('guestDeckedOut'), 'deck-out no está incluido como final natural');
assert.ok(turn.includes("game.deckout.local") && turn.includes('derivePerspectiveTerminalOutcome') && turn.includes('checkGameOver();'), 'deck-out must route through the once-only terminal processor');
assert.ok(turn.includes('playerGameReceipts + game counters are server-owned'), '23.19.5.6 keeps result/reward separation with server-owned result stats');
assert.match(version, /ENGINE_VERSION = '23\.(?:13\.(?:6[8-9]|[7-9]\d)|1[4-7]\.\d+|18(?:\.\d+)?|19(?:\.\d+){1,2}|20(?:\.\d+)*)(?:\.\d+)?'/, 'el contrato anti-farming debe sobrevivir en 23.13.68+');
assert.ok(version.includes("FIRESTORE_RULES_VERSION = '23.13.80'"));

console.log('PVP_ANTI_FARM_23_13_68_OK natural=always early=3m+4turn pair=5 daily=1200 server=bothReadyAt+endedAt');
