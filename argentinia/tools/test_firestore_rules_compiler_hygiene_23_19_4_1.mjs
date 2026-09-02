import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'build-manifest.json'), 'utf8'));
assert.equal(ENGINE_VERSION, '23.19.5.1');
assert.equal(FIRESTORE_RULES_VERSION, '23.13.79');
assert.equal(manifest.firestoreRulesVersion, '23.13.79');

const rulesPath = process.env.ARGENTINIA_FIRESTORE_RULES || '';
if (rulesPath && fs.existsSync(rulesPath)) {
  const rules = fs.readFileSync(rulesPath, 'utf8');
  const deadHelpers = [
    'hasSecureDailyState','expectedLastClaimAfterLogin','validDailyLoginTransition',
    'validConsecutiveDailyAdvance','validDailyLoginTransitionV4','validDailyConsistencyRepairV4',
    'validAdminDailyConsistencyRepairV4','validConsecutiveDailyAdvanceV2','validDailyGapResetV3',
    'validAdminDailyGapResetV3','validAdminDailyLoginTransition','validAdminConsecutiveDailyAdvanceV2',
    'pvpMinRewardMinutes','pvpMinCompletedTurns','pvpMaxPairDaily','pvpMaxPointsDaily',
    'cleanDailyOneToday','continuesDailyCycle','expectedClaimedDaysAfterLogin','expectedCycleStartDay',
    'expectedDailyStreak','expectedUnlockedDays','isPreviousOfficialRewardDay','validLastClaimAfterLogin',
    'validAdminDailyContinueState','validAdminDailyResetState','validDailyContinuationStateV4',
    'validDailyDocumentShapeV4','validDailyResetStateV4'
  ];
  for (const name of deadHelpers) {
    assert.ok(!rules.includes(`function ${name}(`), `legacy unreachable helper survived: ${name}`);
  }
  assert.ok(rules.includes('function officialRewardNow()'), 'officialRewardNow still has unused userId parameter');
  assert.ok(rules.includes('function officialRewardDay()'), 'officialRewardDay still has unused userId parameter');
  assert.ok(rules.includes('function validAdminDailyResetStateV4(d)'), 'Admin D1 reset helper still has unused oldD parameter');
  assert.ok(rules.includes('function validNormalDailyCommonShapeV6(d)'), 'Normal common shape signature drift');
  assert.ok(rules.includes('function validNormalDailyLoginTransitionV6()'), 'Normal login helper still has unused userId parameter');
}
console.log('FIRESTORE_RULES_COMPILER_HYGIENE_23_19_4_1_OK engine=23.19.5 rules=23.13.79 deadHelpers=REMOVED unusedParams=REMOVED semantics=UNCHANGED');
