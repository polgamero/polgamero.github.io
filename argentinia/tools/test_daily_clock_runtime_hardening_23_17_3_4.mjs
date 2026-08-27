import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { advanceDailyLoginState, localDateKey } from '../js/rewards.js';
import { ENGINE_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const impl = fs.readFileSync(path.join(root,'js/firebaseClientImpl.js'),'utf8');
const main = fs.readFileSync(path.join(root,'js/main.js'),'utf8');
const rulesPath = process.env.ARGENTINIA_FIRESTORE_RULES || path.resolve(root,'../../FIRESTORE_RULES_COMPLETAS_ENTREGA_23_13_72_RULE_BUDGET_ROUTER_HOTFIX.rules');
const rules = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath,'utf8') : '';
const manifest = JSON.parse(fs.readFileSync(path.join(root,'build-manifest.json'),'utf8'));

assert.equal(ENGINE_VERSION,'23.17.4.1');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.72');
assert.equal(manifest.engineVersion,'23.17.4.1');
assert.equal(manifest.firestoreRulesVersion,'23.13.72');

const day = n => new Date(Date.UTC(2026,7,27+n,15,30,0));
const d1 = advanceDailyLoginState(null, day(0));
assert.equal(d1.state.streak,1);
assert.deepEqual(d1.state.unlockedDays,[1]);
const persistedD1Like={
  schemaVersion:4,
  serverCycleStartDay:new Date('2026-08-27T00:00:00Z'),
  serverPreviousLoginDay:null,
  serverLastLoginDay:new Date('2026-08-27T00:00:00Z'),
  streak:1, unlockedDays:[1], claimedDays:[], lastClaimedDay:null
};
const d2=advanceDailyLoginState(persistedD1Like,day(1));
assert.equal(d2.state.streak,2);
assert.equal(d2.state.previousLoginDate,'2026-08-27');
const gap=advanceDailyLoginState(persistedD1Like,day(2));
assert.equal(gap.state.streak,1);
assert.equal(gap.streakReset,true);
assert.equal(localDateKey(day(0)),'2026-08-27');

// Clock: one in-flight probe per uid, retries transient unresolved reads, accepts Timestamp-like values.
for (const marker of [
  'const authoritativeClockInFlight = new Map()',
  'function firestoreTimestampLikeToDate(value)',
  'for (let attempt = 0; attempt < 3; attempt += 1)',
  "if (error?.code === 'permission-denied'",
  'const existing = authoritativeClockInFlight.get(uid)',
  'const dailyLoginInFlight = new Map()',
  'if (existing) return existing',
  'let classifiedsScheduleEnsureInFlight = null'
]) assert.ok(impl.includes(marker),`missing runtime hardening marker: ${marker}`);

// Claim now carries a top-level request.time seal too.
assert.ok(impl.includes('dailyRewards: persistedDaily,\n      lastSeenAt: serverTimestamp()'));
assert.ok(impl.includes('serializeDailyLoginPlan(data, plan, now, clock.serverNow)'), 'Login normal volvió a usar nested serverTimestamp en dailyRewards.');
assert.ok(impl.includes('serializeDailyRewardsForFirestore(nextDaily, now, clock.serverNow)'), 'Claim volvió a usar nested serverTimestamp en dailyRewards.');

// Console remains quiet for informational Daily/bootstrap diagnostics.
assert.ok(!main.includes('[DailyRewards 23.13.62] Decisión de bootstrap:'));

if (rules) {
  assert.ok(rules.includes('function validNormalDailyLoginTransitionV6(userId)'));
  assert.ok(rules.includes("changed.hasOnly(['dailyRewards', 'lastSeenAt'])"));
  assert.ok(rules.includes("changed.hasAll(['dailyRewards', 'lastSeenAt'])"));
  assert.ok(rules.includes("request.resource.data.get('lastSeenAt', null) == request.time"));
  assert.ok(rules.includes('function validDailyRoutedUpdate(userId)'));
  assert.ok(rules.includes('validAdminDailyLoginTransitionV4(userId)'));
  assert.ok(rules.includes("'23.13.71', '23.13.72']"));
  const v6 = rules.slice(rules.indexOf('function validNormalDailyCommonShapeV6'), rules.indexOf('// 23.13.62 — ADMIN DAILY QA CONTRACT'));
  assert.ok(v6.includes("d.get('serverUpdatedAt', null) is timestamp"));
  assert.ok(!v6.includes('serverUpdatedAt == request.time'), 'Normal V6 volvió a depender del nested transform para autorizar.');
  const claim = rules.slice(rules.indexOf('function validDailyClaimTransition'), rules.indexOf('function validRewardDebugOffsetUpdate'));
  assert.ok(claim.includes("['points', 'fichas', 'inventory', 'dailyRewards', 'lastSeenAt']"));
  assert.ok(claim.includes("request.resource.data.get('lastSeenAt', null) == request.time"));
}

console.log('DAILY_CLOCK_RUNTIME_HARDENING_23_17_3_4_OK normal=D1+D2+gap clock=singleflight+retry claim=topLevelSeal rules=23.13.72');
