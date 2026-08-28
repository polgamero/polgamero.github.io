import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const rulesPath=process.env.ARGENTINIA_FIRESTORE_RULES || path.resolve(root,'../../FIRESTORE_RULES_COMPLETAS_ENTREGA_23_13_72_RULE_BUDGET_ROUTER_HOTFIX.rules');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'build-manifest.json'),'utf8'));
assert.equal(ENGINE_VERSION,'23.17.5.2');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.75');
assert.equal(manifest.engineVersion,'23.17.5.2');
assert.equal(manifest.firestoreRulesVersion,'23.13.75');

if (fs.existsSync(rulesPath)) {
  const rules=fs.readFileSync(rulesPath,'utf8');
  assert.ok(rules.includes('function validDailyRoutedUpdate(userId)'));
  assert.ok(rules.includes('function validNormalDailyLoginTransitionV6(userId)'));
  assert.ok(rules.includes('function dailyStreakStateConsistent(d)'));
  assert.ok(rules.includes("duration.value(streak - 1, 'd')"),'consistencia de racha volvió a enumerar siete ramas completas');
  assert.ok(rules.includes('return touchesPrebuilt\n        ?'),'router principal debe despachar por ternario');
  assert.ok(rules.includes('return isAdmin()\n        ?'),'router Daily debe despachar una sola rama por rol/forma');
  assert.ok(!rules.includes('validNormalDailyLoginTransitionV5(userId)\n                || validDailyClaimTransition(userId)'), 'login y claim volvieron a evaluarse como OR compuesto');
  const userMatch=rules.slice(rules.indexOf('match /users/{userId}'), rules.indexOf('// Ranking visible', rules.indexOf('match /users/{userId}')));
  assert.equal((userMatch.match(/^\s*allow update:/gm)||[]).length,1,'users/{uid} volvió a tener múltiples árboles allow update');
  assert.ok(userMatch.includes('request.auth.uid == userId && validOwnUserUpdate(userId)'));
  assert.ok(rules.includes("'23.13.75'"));
}

console.log('FIRESTORE_RULE_BUDGET_ROUTER_23_17_3_5_OK dispatcher=single-branch daily=V6 consistency=compact usersUpdate=single-allow rules=23.13.75');
