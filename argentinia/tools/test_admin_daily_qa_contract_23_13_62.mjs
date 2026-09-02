import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const rewards = await import(pathToFileURL(path.join(root, 'js/rewards.js')).href);
const impl = fs.readFileSync(path.join(root, 'js/firebaseClientImpl.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
const version = fs.readFileSync(path.join(root, 'js/version.js'), 'utf8');

const stamp = day => new Date(`2026-08-${String(day).padStart(2,'0')}T00:00:00.000Z`);
const adminD6 = {
  schemaVersion: 4,
  serverCycleStartDay: stamp(24),
  serverPreviousLoginDay: stamp(28),
  serverLastLoginDay: stamp(29),
  serverUpdatedAt: stamp(29),
  streak: 6,
  unlockedDays: [1,2,3,4,5,6],
  claimedDays: [1,2,3,4,5],
  lastClaimedDay: 5
};
// Reproduce exactamente la transición rechazada en producción: QA Admin D6(29) -> D7(30).
const d7 = rewards.advanceDailyLoginState(adminD6, new Date('2026-08-30T15:00:00.000Z'));
expect(d7.newCalendarLogin === true, 'Admin D6→D7 debe ser un nuevo login QA.');
expect(d7.state.streak === 7 && d7.state.previousLoginDate === '2026-08-29', 'Admin D6→D7 no conservó continuidad.');
expect(d7.state.cycleStartDate === '2026-08-24', 'Admin D6→D7 alteró el inicio del ciclo.');
expect(JSON.stringify(d7.state.claimedDays) === JSON.stringify([1,2,3,4,5]), 'Admin D6→D7 alteró claims existentes.');

const adminD7 = {
  schemaVersion: 4,
  serverCycleStartDay: stamp(24),
  serverPreviousLoginDay: stamp(29),
  serverLastLoginDay: stamp(30),
  serverUpdatedAt: stamp(30),
  streak: 7,
  unlockedDays: [1,2,3,4,5,6,7],
  claimedDays: [1,2,3,4,5,6,7],
  lastClaimedDay: 7
};
// Prueba que el usuario quiere dejar corriendo: mañana real + mismo offset debe volver a D1.
const tomorrowAfterD7 = rewards.advanceDailyLoginState(adminD7, new Date('2026-08-31T15:00:00.000Z'));
expect(tomorrowAfterD7.state.streak === 1 && tomorrowAfterD7.rewardDay === 1, 'Admin D7→mañana no resetea a D1.');
expect(tomorrowAfterD7.cycleCompleted === true, 'Admin D7→mañana no marca ciclo completado.');
expect(tomorrowAfterD7.state.previousLoginDate === null, 'Nuevo D1 Admin no debe conservar predecesor.');

// RESET QA vuelve del futuro simulado al día real: debe ser D1 limpio, no continuidad negativa.
const resetBackToRealDay = rewards.advanceDailyLoginState(adminD7, new Date('2026-08-24T15:00:00.000Z'));
expect(resetBackToRealDay.state.streak === 1 && resetBackToRealDay.streakReset === true, 'RESET Admin hacia atrás no produce D1.');
expect(resetBackToRealDay.state.cycleStartDate === '2026-08-24', 'RESET Admin no ancla D1 al día efectivo real.');
expect(resetBackToRealDay.state.claimedDays.length === 0, 'RESET Admin debe limpiar claims del ciclo simulado.');

expect(impl.includes('adminAdvanceDailyRewardDebugDay'), 'Se perdió el control +1 DÍA Admin.');
expect(impl.includes('adminResetDailyRewardDebug'), 'Se perdió RESET Admin.');
expect(impl.includes('applyAdminDailyDebugOffset'), 'Admin QA no usa una transacción atómica dedicada.');
expect(impl.includes("const update = { rewardDebugOffsetDays: nextOffset, lastSeenAt: serverTimestamp() };"),
  'La transacción Admin no incluye el reloj QA.');
expect(impl.includes('if (plan.login.newCalendarLogin) update.dailyRewards = serializeDailyLoginPlan(data, plan, now);'),
  'La transacción Admin no acopla Daily al reloj QA.');
expect(!ui.includes('const offset = await adminAdvanceDailyRewardDebugDay(state.currentUser.uid);\n        const result = await registerDailyLogin(state.currentUser.uid);'),
  '+1 DÍA sigue siendo una secuencia de dos transacciones.');
expect(!ui.includes('await adminResetDailyRewardDebug(state.currentUser.uid);\n        // 23.13.6'),
  'RESET sigue siendo una secuencia vieja de dos transacciones.');
expect(impl.includes('adminQa:'), 'registerDailyLogin no diagnostica explícitamente el modo Admin QA.');
expect(version.includes("FIRESTORE_RULES_VERSION = '23.13.79'"), 'Frontend no exige Rules 23.13.79.');
expect(version.includes('Admin Daily QA Contract'), 'Build no declara el contrato Admin Daily QA.');

console.log('ADMIN_DAILY_QA_23_13_62_OK d6>d7=ALLOW_MODEL d7>next=D1 resetBack=D1 debugTx=atomic rules=separate-contract');
