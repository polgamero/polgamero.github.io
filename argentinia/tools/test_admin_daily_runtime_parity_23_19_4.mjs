import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const impl = fs.readFileSync(path.join(root, 'js/firebaseClientImpl.js'), 'utf8');
const serverDaily = fs.readFileSync(path.join(root, '../functions/src/economy/daily.js'), 'utf8');
const fnIndex = fs.readFileSync(path.join(root, '../functions/src/index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'build-manifest.json'), 'utf8'));

assert.equal(ENGINE_VERSION, '23.19.5.4');
assert.equal(FIRESTORE_RULES_VERSION, '23.13.79');
assert.equal(manifest.engineVersion, '23.19.5.4');
assert.equal(manifest.firestoreRulesVersion, '23.13.79');

// 23.19.5.4 moves the authoritative write off the browser entirely. Preserve the old
// data-shape invariants server-side while preventing current clients from issuing Daily txs.
assert.ok(serverDaily.includes('serializeDailyState(plan.state,new Date(serverNowMs))'),
  'Server Daily login must persist resolved server-clock metadata.');
assert.ok(serverDaily.includes('FieldValue.serverTimestamp()'),
  'Server Daily writes must retain a server timestamp seal.');
assert.ok(fnIndex.includes('export const economyRegisterDailyLogin'),
  'Daily login callable disappeared.');
assert.ok(fnIndex.includes('export const economyAdminDailyDebug'),
  'Admin Daily QA callable disappeared.');
const clientDaily = impl.slice(impl.indexOf('// 23.19.5.4 — DAILY REWARDS AUTHORITY.'), impl.indexOf('// Craftea una mejora permanente'));
assert.ok(clientDaily.includes('registerDailyLoginServer()'), 'Browser Daily login is no longer routed to Functions.');
assert.ok(!clientDaily.includes('runTransaction('), 'Browser regained direct Daily mutation authority.');

// When a private Rules candidate is supplied locally, lock the exact security invariant
// that production exposed. GitHubSource intentionally does not contain firestore.rules.
const rulesPath = process.env.ARGENTINIA_FIRESTORE_RULES || '';
if (rulesPath && fs.existsSync(rulesPath)) {
  const rules = fs.readFileSync(rulesPath, 'utf8');
  assert.ok(rules.includes('function validAdminDailyDocumentShapeV7(d)'),
    'Rules 23.13.79 Admin parity shape missing.');
  const start = rules.indexOf('function validAdminDailyDocumentShapeV7(d)');
  const end = rules.indexOf('function validNormalDailyCommonShapeV6', start);
  const adminShape = rules.slice(start, end);
  assert.ok(adminShape.includes("d.get('serverUpdatedAt', null) is timestamp"),
    'Admin serverUpdatedAt must remain metadata timestamp.');
  assert.ok(!adminShape.includes('&& d.serverUpdatedAt == request.time') && !adminShape.includes("d.get('serverUpdatedAt', null) == request.time"),
    'Regression: Admin nested serverUpdatedAt must NEVER be request.time authority.');
  const loginStart = rules.indexOf('function validAdminDailyLoginTransitionV4');
  const loginEnd = rules.indexOf('function validAdminDailyDebugClockTransitionV4', loginStart);
  const adminLogin = rules.slice(loginStart, loginEnd);
  assert.ok(adminLogin.includes('validAdminDailyDocumentShapeV7(d)'),
    'Admin login routed back through strict V4 shape.');
  assert.ok(adminLogin.includes('request.resource.data.lastSeenAt == request.time'),
    'Admin login lost top-level request.time seal.');

  const debugStart = rules.indexOf('function validAdminDailyDebugClockTransitionV4');
  const debugEnd = rules.indexOf('// 23.13.60 — FAST PATH DE RESET POR GAP', debugStart);
  const adminDebug = rules.slice(debugStart, debugEnd);
  assert.ok(adminDebug.includes('validAdminDailyDocumentShapeV7(d)'),
    'Admin debug clock routed back through strict V4 shape.');
  assert.ok(adminDebug.includes('request.resource.data.lastSeenAt == request.time'),
    'Admin debug clock lost top-level request.time seal.');

  const normalStart = rules.indexOf('function validNormalDailyCommonShapeV6');
  const normalEnd = rules.indexOf('// 23.13.62 — ADMIN DAILY QA CONTRACT', normalStart);
  const normal = rules.slice(normalStart, normalEnd);
  assert.ok(normal.includes("d.get('serverUpdatedAt', null) is timestamp"));
  assert.ok(!normal.includes('&& d.serverUpdatedAt == request.time') && !normal.includes("d.get('serverUpdatedAt', null) == request.time"),
    'Normal users must not regress to nested request.time equality.');
}

console.log('ADMIN_DAILY_RUNTIME_PARITY_23_19_4_OK engine=23.19.5.4 rules=23.13.79 authority=SERVER browserDirectTx=DISABLED');
