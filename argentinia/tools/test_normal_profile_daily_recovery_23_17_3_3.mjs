import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { advanceDailyLoginState } from '../js/rewards.js';
import { ENGINE_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const main = fs.readFileSync(path.join(root,'js/main.js'),'utf8');
const loader = fs.readFileSync(path.join(root,'js/cardLoader.js'),'utf8');
const impl = fs.readFileSync(path.join(root,'js/firebaseClientImpl.js'),'utf8');
const rulesPath = process.env.ARGENTINIA_FIRESTORE_RULES || path.resolve(root,'../../rules/FIRESTORE_RULES_COMPLETAS_ENTREGA_23_13_72_RULE_BUDGET_ROUTER_HOTFIX.rules');
const rules = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath,'utf8') : '';

assert.equal(ENGINE_VERSION, '23.19.4');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.77');

// Perfil sin Daily previo: dominio puro debe producir un D1 limpio.
const d1 = advanceDailyLoginState(null, new Date('2026-08-27T15:55:44.000Z'));
assert.equal(d1.newCalendarLogin, true);
assert.equal(d1.state.streak, 1);
assert.deepEqual(d1.state.unlockedDays,[1]);
assert.deepEqual(d1.state.claimedDays,[]);

// Nunca convertir el sentinel latestTotal:null en saldo 0.
assert.ok(main.includes("typeof recoveredRewards?.latestTotal === 'number' && Number.isFinite(recoveredRewards.latestTotal)"));
assert.ok(!main.includes('Number.isFinite(Number(recoveredRewards?.latestTotal))'));

// Consola normal limpia: auditoría sigue disponible sólo bajo demanda en Admin.
assert.ok(!loader.includes('console.log(`[CardDatabase] Pool validado:'));
assert.ok(!loader.includes('void this.reportMissingImagesFromManifest();'));
assert.ok(!main.includes("[DailyRewards 23.13.62] Decisión de bootstrap:"));
assert.ok(!impl.includes('Firestore rechazó registerDailyLogin.'));

if (rules) {
  assert.ok(rules.includes('function validNormalDailyLoginTransitionV6(userId)'));
  assert.ok(rules.includes('function validDailyRoutedUpdate(userId)'));
  assert.ok(rules.includes('validNormalDailyCleanD1V6(d, userId)'));
  assert.ok(rules.includes('// 23.13.72 — DAILY ROUTER por forma del diff'));
  assert.ok(rules.includes("'23.13.77'"));
  assert.ok(rules.includes('validAdminDailyLoginTransitionV4(userId)'));
}

console.log('NORMAL_PROFILE_DAILY_RECOVERY_23_17_3_3_OK normalD1=explicit admin=separate latestTotal=null-preserved console=quiet rules=23.13.77');
