import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const fail = msg => { throw new Error(msg); };
const expect = (cond, msg) => { if (!cond) fail(msg); };
const rewards = await import(pathToFileURL(path.join(root, 'js/rewards.js')).href);

const today = new Date('2026-08-24T15:00:00.000Z');
const day = n => new Date(Date.UTC(2026, 7, 24 + n));

// Reproducción exacta de la clase de bug 23.13.60: schema 3 podía parecer perfectamente
// consistente (cycle=22, last=24, streak=3) aunque no existía prueba de login el día 23.
const legacyPlausibleButUnprovable = {
  schemaVersion: 3,
  serverCycleStartDay: day(-2),
  serverLastLoginDay: day(0),
  serverUpdatedAt: today,
  streak: 3,
  unlockedDays: [1,2,3],
  claimedDays: [1,2,3],
  lastClaimedDay: 3
};
expect(rewards.hasAuthoritativeDailyState(legacyPlausibleButUnprovable) === false,
  'Schema 3 no debe seguir considerándose continuidad autoritativa.');
const migrated = rewards.advanceDailyLoginState(
  rewards.hasAuthoritativeDailyState(legacyPlausibleButUnprovable) ? legacyPlausibleButUnprovable : null,
  today
);
expect(migrated.newCalendarLogin === true && migrated.state.streak === 1 && migrated.rewardDay === 1,
  'Un schema 3 no verificable debe migrar a D1.');
expect(migrated.state.previousLoginDate === null, 'D1 migrado no debe inventar predecesor.');

const schema4D1Yesterday = {
  schemaVersion: 4,
  serverCycleStartDay: day(-1),
  serverPreviousLoginDay: null,
  serverLastLoginDay: day(-1),
  serverUpdatedAt: day(-1),
  streak: 1,
  unlockedDays: [1],
  claimedDays: [1],
  lastClaimedDay: 1
};
expect(rewards.hasAuthoritativeDailyState(schema4D1Yesterday) === true, 'Schema 4 D1 válido no es autoritativo.');
expect(rewards.isDailyStreakConsistent(schema4D1Yesterday, today) === true, 'Schema 4 D1 válido fue marcado inconsistente.');
const d2 = rewards.advanceDailyLoginState(schema4D1Yesterday, today);
expect(d2.state.streak === 2 && d2.state.previousLoginDate === '2026-08-23', 'D1→D2 no selló el día anterior.');

const schema4D3Today = {
  schemaVersion: 4,
  serverCycleStartDay: day(-2),
  serverPreviousLoginDay: day(-1),
  serverLastLoginDay: day(0),
  serverUpdatedAt: today,
  streak: 3,
  unlockedDays: [1,2,3],
  claimedDays: [1,2],
  lastClaimedDay: 2
};
expect(rewards.isDailyStreakConsistent(schema4D3Today, today) === true, 'Schema 4 D3 válido no pasa continuidad.');
const sameDay = rewards.advanceDailyLoginState(schema4D3Today, today);
expect(sameDay.newCalendarLogin === false && sameDay.state.streak === 3, 'Schema 4 válido hoy dejó de ser idempotente.');

const schema4BrokenProof = { ...schema4D3Today, serverPreviousLoginDay: day(-2) };
expect(rewards.isDailyStreakConsistent(schema4BrokenProof, today) === false, 'Predecesor incorrecto no fue detectado.');
const repaired = rewards.advanceDailyLoginState(schema4BrokenProof, today);
expect(repaired.repairApplied === true && repaired.state.streak === 1, 'Schema 4 con prueba rota no vuelve a D1.');

const schema4Gap = {
  schemaVersion: 4,
  serverCycleStartDay: day(-4),
  serverPreviousLoginDay: day(-3),
  serverLastLoginDay: day(-2),
  serverUpdatedAt: day(-2),
  streak: 3,
  unlockedDays: [1,2,3],
  claimedDays: [1,2,3],
  lastClaimedDay: 3
};
expect(rewards.isDailyStreakConsistent(schema4Gap, today) === true, 'Estado previo schema 4 válido fue marcado corrupto.');
const gapReset = rewards.advanceDailyLoginState(schema4Gap, today);
expect(gapReset.streakReset === true && gapReset.state.streak === 1 && gapReset.state.previousLoginDate === null,
  'Gap schema 4 no reseteó a D1.');

const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
const impl = fs.readFileSync(path.join(root, 'js/firebaseClientImpl.js'), 'utf8');
const version = fs.readFileSync(path.join(root, 'js/version.js'), 'utf8');

expect(!ui.includes('void maybeShowAnnouncementPopup({ currentUser: state.currentUser });'),
  'showMainMenu todavía dispara el anuncio antes de resolver Auth/Daily.');
const dailyPos = main.indexOf("await showDailyLoginRewardModal(dailyResult.login)");
const announcementPos = main.indexOf('await maybeShowAnnouncementPopup({ currentUser: state.currentUser })', dailyPos);
expect(dailyPos >= 0 && announcementPos > dailyPos, 'El anuncio no está secuenciado después del modal Daily.');
expect(main.includes('await waitForInitialAuthState();\n      if (!state.currentUser) await maybeShowAnnouncementPopup({ currentUser: null });'),
  'El anuncio guest no espera resolución real de Auth.');
expect(ui.includes("return closedPromise;"), 'El modal Daily no expone cierre awaitable para la cola de overlays.');
expect(impl.includes('legacyContinuityMigration'), 'Firebase no marca migración de continuidad legacy.');
expect(impl.includes('persistedDaily.serverPreviousLoginDay = data.dailyRewards.serverLastLoginDay'),
  'Firebase no sella el predecesor real al continuar la racha.');
expect(version.includes("FIRESTORE_RULES_VERSION = '23.13.68'"), 'Frontend no exige Rules 23.13.68.');
expect(!fs.existsSync(path.join(root, 'firestore.rules')) && !fs.existsSync(path.join(root, 'firebase.json')),
  'Infra Firestore volvió a quedar dentro del árbol público /argentinia.');

console.log('DAILY_CONTINUITY_OVERLAY_23_13_61_OK legacySchema3=D1 proof=previousDay overlayOrder=daily>announcement publicRules=absent');
