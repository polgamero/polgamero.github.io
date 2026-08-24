import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const fail = msg => { throw new Error(msg); };
const expect = (cond, msg) => { if (!cond) fail(msg); };

const rewards = await import(pathToFileURL(path.join(root, 'js/rewards.js')).href);
const sameDayCorrupt = {
  schemaVersion: 3,
  serverCycleStartDay: new Date('2026-08-20T00:00:00.000Z'),
  serverLastLoginDay: new Date('2026-08-24T00:00:00.000Z'),
  serverUpdatedAt: new Date('2026-08-24T10:00:00.000Z'),
  streak: 3,
  unlockedDays: [1, 2, 3],
  claimedDays: [1, 2, 3],
  lastClaimedDay: 3
};
expect(rewards.isDailyStreakConsistent(sameDayCorrupt) === false, 'El estado same-day corrupto no fue detectado.');
const repaired = rewards.advanceDailyLoginState(sameDayCorrupt, new Date('2026-08-24T15:00:00.000Z'));
expect(repaired.repairApplied === true, 'El estado same-day corrupto no activó reparación.');
expect(repaired.state.streak === 1 && repaired.rewardDay === 1, 'La reparación no volvió a Día 1.');
expect(JSON.stringify(repaired.state.unlockedDays) === '[1]', 'La reparación no limpió unlockedDays.');
expect(JSON.stringify(repaired.state.claimedDays) === '[]', 'La reparación no limpió claimedDays.');

const sameDayClaimCorrupt = {
  ...sameDayCorrupt,
  serverCycleStartDay: new Date('2026-08-22T00:00:00.000Z'),
  claimedDays: [1, 4],
  lastClaimedDay: 4
};
expect(rewards.isDailyStreakConsistent(sameDayClaimCorrupt) === false, 'Claims fuera de la racha no fueron detectados como corrupción.');
const repairedClaims = rewards.advanceDailyLoginState(sameDayClaimCorrupt, new Date('2026-08-24T15:00:00.000Z'));
expect(repairedClaims.repairApplied === true && repairedClaims.state.streak === 1, 'La corrupción de claims no volvió a Día 1.');

// 23.13.61 endurece el modelo: schema 3 ya no puede demostrar continuidad. El test
// histórico 23.13.60 conserva sus invariantes de lazy/stats, pero usa schema 4 para los
// casos que hoy sí consideramos verificables.
const sameDayValid = {
  ...sameDayCorrupt,
  schemaVersion: 4,
  serverCycleStartDay: new Date('2026-08-22T00:00:00.000Z'),
  serverPreviousLoginDay: new Date('2026-08-23T00:00:00.000Z')
};
expect(rewards.isDailyStreakConsistent(sameDayValid) === true, 'Una racha schema 4 válida fue marcada corrupta.');
const idempotent = rewards.advanceDailyLoginState(sameDayValid, new Date('2026-08-24T15:00:00.000Z'));
expect(idempotent.newCalendarLogin === false && idempotent.repairApplied === false, 'Un login válido del mismo día dejó de ser idempotente.');

const priorGap = {
  ...sameDayValid,
  serverCycleStartDay: new Date('2026-08-20T00:00:00.000Z'),
  serverPreviousLoginDay: new Date('2026-08-21T00:00:00.000Z'),
  serverLastLoginDay: new Date('2026-08-22T00:00:00.000Z')
};
expect(rewards.isDailyStreakConsistent(priorGap) === true, 'La racha schema 4 previa al gap debería ser internamente válida.');
const gap = rewards.advanceDailyLoginState(priorGap, new Date('2026-08-24T15:00:00.000Z'));
expect(gap.streakReset === true && gap.state.streak === 1 && gap.repairApplied === false, 'El gap normal no volvió a Día 1.');

const facade = fs.readFileSync(path.join(root, 'js/firebaseClient.js'), 'utf8');
const impl = fs.readFileSync(path.join(root, 'js/firebaseClientImpl.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const version = fs.readFileSync(path.join(root, 'js/version.js'), 'utf8');

expect(facade.includes("import { ENGINE_VERSION } from './version.js'"), 'La fachada lazy no conoce la versión del build.');
expect(facade.includes('firebaseClientImpl.js?v=${encodeURIComponent(ENGINE_VERSION)}'), 'firebaseClientImpl sigue usando URL cacheable sin versión.');
expect(facade.includes('FIREBASE_LAZY_BUILD_MISMATCH'), 'Falta attestation del módulo Firebase lazy.');
expect(impl.includes('export const FIREBASE_IMPL_VERSION = ENGINE_VERSION'), 'Impl Firebase no publica su versión real.');
expect(impl.includes('const REWARD_RULES_VERSION = FIRESTORE_RULES_VERSION'), 'Rules version vuelve a estar hardcodeada fuera de version.js.');
expect(impl.includes('export async function flushPendingGameRewards'), 'Impl perdió flushPendingGameRewards.');
expect(facade.includes("export const flushPendingGameRewards = asyncProxy('flushPendingGameRewards')"), 'Fachada perdió flushPendingGameRewards.');

const dailyPos = main.indexOf('const dailyResult = await processDailyLoginRewards({ showModal: false })');
const statsPos = main.indexOf('void bootstrapPlayerStatistics(state.currentUser.uid)', dailyPos);
expect(dailyPos >= 0 && statsPos > dailyPos, 'Stats vuelve a correr en paralelo antes de Daily Rewards.');
const deltaLine = "if (delta) stats[key] = Math.max(0, (Number(stats[key]) || 0) + delta);";
expect(impl.split(deltaLine).length - 1 === 1, 'trackPlayerStats está aplicando deltas más de una vez.');


console.log('FIREBASE_DAILY_REPAIR_23_13_60_OK lazy=versioned+attested daily=legacy-preserved-by-61 stats=serialized');
