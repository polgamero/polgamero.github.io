import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
function fail(msg) { throw new Error(msg); }
function expect(cond, msg) { if (!cond) fail(msg); }

// localStorage mínimo para probar la cola síncrona.
const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
};

const gameRewards = await import(pathToFileURL(path.join(root, 'js/gameRewards.js')).href);
const rewards = await import(pathToFileURL(path.join(root, 'js/rewards.js')).href);

const queued = gameRewards.queuePendingGameReward('uid_a', {
  receiptId: 'solo_abc', baseDelta: 100, mode: 'solo', outcome: 'win', queuedAtMs: 1
});
expect(queued?.receiptId === 'solo_abc', 'No se pudo encolar receipt Solo.');
expect(gameRewards.pendingGameRewardsForUid('uid_a').length === 1, 'La cola no persistió el reward.');
// Reencolar mismo receipt debe reemplazar, no duplicar.
gameRewards.queuePendingGameReward('uid_a', { receiptId: 'solo_abc', baseDelta: 100, mode: 'solo', outcome: 'win', queuedAtMs: 2 });
expect(gameRewards.pendingGameRewardsForUid('uid_a').length === 1, 'Receipt duplicado en cola local.');
gameRewards.removePendingGameReward('uid_a', 'solo_abc');
expect(gameRewards.pendingGameRewardsForUid('uid_a').length === 0, 'No se pudo limpiar receipt settlement.');

// Caso reportado: streak 3, se saltea un día => nuevo ciclo Día 1 limpio.
const rawStreak3 = {
  schemaVersion: 3,
  serverCycleStartDay: new Date('2026-08-20T00:00:00.000Z'),
  serverLastLoginDay: new Date('2026-08-22T00:00:00.000Z'),
  serverUpdatedAt: new Date('2026-08-22T12:00:00.000Z'),
  streak: 3,
  unlockedDays: [1,2,3],
  claimedDays: [1,2,3],
  lastClaimedDay: 3
};
// ART 24/08 = usamos instante UTC que cae inequívocamente en 24/08 ART.
const reset = rewards.advanceDailyLoginState(rawStreak3, new Date('2026-08-24T15:00:00.000Z'));
expect(reset.newCalendarLogin === true, 'Gap no fue registrado como nuevo login.');
expect(reset.streakReset === true, 'Gap no marcó streakReset.');
expect(reset.rewardDay === 1 && reset.state.streak === 1, 'Gap no volvió a Día 1.');
expect(JSON.stringify(reset.state.unlockedDays) === '[1]', 'Gap no limpió unlockedDays.');
expect(JSON.stringify(reset.state.claimedDays) === '[]', 'Gap no limpió claimedDays.');
expect(reset.state.lastClaimedDay == null, 'Gap no limpió lastClaimedDay.');

const impl = fs.readFileSync(path.join(root, 'js/firebaseClientImpl.js'), 'utf8');
const turn = fs.readFileSync(path.join(root, 'js/turnManager.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const matchAuthority = fs.readFileSync(path.join(root, '../functions/src/economy/matches.js'), 'utf8');
expect(matchAuthority.includes("db.collection('gameRewardReceipts')"), 'Falta receipt remoto server-side de game reward.');
expect(!impl.includes("doc(db, 'gameRewardReceipts'"), '23.19.5.6 no debe escribir gameRewardReceipts desde browser.');
expect(impl.includes('export async function awardGamePointsOnce'), 'Falta settlement idempotente.');
expect(impl.includes('export async function flushPendingGameRewards'), 'Falta reconciliación al login.');
expect(turn.includes('queuePendingGameReward(state.currentUser.uid'), 'Game over no encola sincrónicamente antes del await.');
expect(turn.includes("recordTelemetryEvent('game_reward_queued'"), 'Falta observabilidad game_reward_queued.');
expect(main.includes('await flushPendingGameRewards(state.currentUser.uid)'), 'Boot no reconcilia rewards pendientes.');
expect(main.includes("recordTelemetryEvent('daily_login_reward_failed'"), 'Falta observabilidad de rechazo Daily Rewards.');

console.log('REWARD_SETTLEMENT_STREAK_23_13_59_OK queue=idempotent gap=D1 receipt=durable retry=boot');
