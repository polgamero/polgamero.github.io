import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const impl = fs.readFileSync(path.join(root, 'js/firebaseClientImpl.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'build-manifest.json'), 'utf8'));

assert.equal(ENGINE_VERSION, '23.19.4.1');
assert.equal(FIRESTORE_RULES_VERSION, '23.13.78');
assert.equal(manifest.engineVersion, '23.19.4.1');
assert.equal(manifest.firestoreRulesVersion, '23.13.78');

// Production shape that triggered the incident: nested serverUpdatedAt is a resolved
// authoritative clock snapshot, while the top-level lastSeenAt is the request.time seal.
assert.ok(impl.includes('serializeDailyLoginPlan(data, plan, now, clock.serverNow)'),
  'Normal/Admin-login runtime must persist the already-resolved authoritative clock metadata.');
assert.ok(impl.includes('lastSeenAt: serverTimestamp()'),
  'Daily writes must retain the top-level serverTimestamp authorization seal.');
assert.ok(impl.includes('function isAdminDailyQaUser(uid)'),
  'Admin Daily QA identity path disappeared.');
assert.ok(impl.includes('applyAdminDailyDebugOffset'),
  'Admin Daily QA debug clock path disappeared.');

// When a private Rules candidate is supplied locally, lock the exact security invariant
// that production exposed. GitHubSource intentionally does not contain firestore.rules.
const rulesPath = process.env.ARGENTINIA_FIRESTORE_RULES || '';
if (rulesPath && fs.existsSync(rulesPath)) {
  const rules = fs.readFileSync(rulesPath, 'utf8');
  assert.ok(rules.includes('function validAdminDailyDocumentShapeV7(d)'),
    'Rules 23.13.78 Admin parity shape missing.');
  const start = rules.indexOf('function validAdminDailyDocumentShapeV7(d)');
  const end = rules.indexOf('function validDailyContinuationStateV4', start);
  const adminShape = rules.slice(start, end);
  assert.ok(adminShape.includes("d.get('serverUpdatedAt', null) is timestamp"),
    'Admin serverUpdatedAt must remain metadata timestamp.');
  assert.ok(!adminShape.includes('serverUpdatedAt == request.time'),
    'Regression: Admin nested serverUpdatedAt must NEVER be request.time authority.');
  const loginStart = rules.indexOf('function validAdminDailyLoginTransitionV4');
  const loginEnd = rules.indexOf('function validAdminDailyDebugClockTransitionV4', loginStart);
  const adminLogin = rules.slice(loginStart, loginEnd);
  assert.ok(adminLogin.includes('validAdminDailyDocumentShapeV7(d)'),
    'Admin login routed back through strict V4 shape.');
  assert.ok(adminLogin.includes('request.resource.data.lastSeenAt == request.time'),
    'Admin login lost top-level request.time seal.');

  const debugStart = rules.indexOf('function validAdminDailyDebugClockTransitionV4');
  const debugEnd = rules.indexOf('function validDailyConsistencyRepairV4', debugStart);
  const adminDebug = rules.slice(debugStart, debugEnd);
  assert.ok(adminDebug.includes('validAdminDailyDocumentShapeV7(d)'),
    'Admin debug clock routed back through strict V4 shape.');
  assert.ok(adminDebug.includes('request.resource.data.lastSeenAt == request.time'),
    'Admin debug clock lost top-level request.time seal.');

  const normalStart = rules.indexOf('function validNormalDailyCommonShapeV6');
  const normalEnd = rules.indexOf('// 23.13.62 — ADMIN DAILY QA CONTRACT', normalStart);
  const normal = rules.slice(normalStart, normalEnd);
  assert.ok(normal.includes("d.get('serverUpdatedAt', null) is timestamp"));
  assert.ok(!normal.includes('serverUpdatedAt == request.time'),
    'Normal users must not regress to nested request.time equality.');
}

console.log('ADMIN_DAILY_RUNTIME_PARITY_23_19_4_OK engine=23.19.4.1 rules=23.13.78 admin=nested-clock-metadata+top-level-seal normal=unchanged-v6');
