import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

const PROJECT_ID = 'demo-argentinia-rules-231360';
const rulesPath = process.env.ARGENTINIA_FIRESTORE_RULES || new URL('../../FIRESTORE_RULES_COMPLETAS_ENTREGA_23_13_68_PVP_ANTI_FARM.rules', import.meta.url);
const rules = fs.readFileSync(rulesPath, 'utf8');
const env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules } });

function artTodayStamp() {
  const shifted = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}
function day(base, offset) {
  return new Date(base.getTime() + offset * 86400000);
}
function daily({ cycle, last, streak, unlocked, claimed = [], lastClaimedDay = null, updated = last }) {
  return {
    schemaVersion: 3,
    serverCycleStartDay: cycle,
    serverLastLoginDay: last,
    serverUpdatedAt: updated,
    streak,
    unlockedDays: unlocked,
    claimedDays: claimed,
    lastClaimedDay
  };
}
async function seedUser(uid, dailyRewards, extra = {}) {
  await env.withSecurityRulesDisabled(async ctx => {
    await ctx.firestore().doc(`users/${uid}`).set({
      username: 'Tester', usernameKey: `tester_${uid}`,
      points: 0, fichas: 0, inventory: { standardPacks: 0, guaranteedMythics: 0 },
      collection: [], dailyRewards, ...extra
    });
  });
}
async function dailyWrite(db, uid, nextDaily, extraPatch = {}) {
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async tx => {
    tx.update(ref, {
      dailyRewards: { ...nextDaily, serverUpdatedAt: serverTimestamp() },
      lastSeenAt: serverTimestamp(),
      ...extraPatch
    });
  });
}

const today = artTodayStamp();
const authed = uid => env.authenticatedContext(uid, { email: `${uid}@example.com` }).firestore();

// 1) Gap real: streak 3 terminó anteayer -> hoy debe resetear a D1.
await seedUser('gap', daily({ cycle: day(today, -4), last: day(today, -2), streak: 3, unlocked: [1,2,3], claimed: [1,2,3], lastClaimedDay: 3 }));
await assertSucceeds(dailyWrite(authed('gap'), 'gap', daily({ cycle: today, last: today, streak: 1, unlocked: [1] })));

// 2) Estado histórico corrupto YA sellado hoy: también debe poder repararse a D1.
await seedUser('corrupt', daily({ cycle: day(today, -4), last: today, streak: 3, unlocked: [1,2,3], claimed: [1,2,3], lastClaimedDay: 3 }));
await assertSucceeds(dailyWrite(authed('corrupt'), 'corrupt', daily({ cycle: today, last: today, streak: 1, unlocked: [1] })));

// 3) Estado histórico corrupto por claims imposibles YA sellado hoy: también se repara.
await seedUser('corruptclaims', daily({ cycle: day(today, -2), last: today, streak: 3, unlocked: [1,2,3], claimed: [1,4], lastClaimedDay: 4 }));
await assertSucceeds(dailyWrite(authed('corruptclaims'), 'corruptclaims', daily({ cycle: today, last: today, streak: 1, unlocked: [1] })));

// 4) Estado válido hoy: un cliente no puede resetear voluntariamente para cobrar D1 otra vez.
await seedUser('validsame', daily({ cycle: day(today, -2), last: today, streak: 3, unlocked: [1,2,3], claimed: [1], lastClaimedDay: 1 }));
await assertFails(dailyWrite(authed('validsame'), 'validsame', daily({ cycle: today, last: today, streak: 1, unlocked: [1] })));

// 5) Continuidad válida de ayer -> hoy.
await seedUser('continue', daily({ cycle: day(today, -3), last: day(today, -1), streak: 3, unlocked: [1,2,3], claimed: [1,2], lastClaimedDay: 2 }));
await assertSucceeds(dailyWrite(authed('continue'), 'continue', daily({ cycle: day(today, -3), last: today, streak: 4, unlocked: [1,2,3,4], claimed: [1,2], lastClaimedDay: 2 })));

// 6) La rama repair/login no puede colar economía en el mismo write.
await seedUser('economy', daily({ cycle: day(today, -4), last: day(today, -2), streak: 3, unlocked: [1,2,3] }));
await assertFails(dailyWrite(authed('economy'), 'economy', daily({ cycle: today, last: today, streak: 1, unlocked: [1] }), { points: 999 }));

await env.cleanup();
console.log('FIRESTORE_RULES_23_13_60_OK gap=D1 corruptSameDay=D1 corruptClaims=D1 validSameDay=DENY continue=ALLOW economyMix=DENY');
