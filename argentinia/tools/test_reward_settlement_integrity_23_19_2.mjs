import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const manifest = JSON.parse(read('build-manifest.json'));
const rewards = read('js/gameRewards.js');
const turn = read('js/turnManager.js');
const firebase = read('js/firebaseClientImpl.js');
const proxy = read('js/firebaseClient.js');
const ui = read('js/ui.js');
const rulesPath = process.env.ARGENTINIA_FIRESTORE_RULES || '';

assert.equal(ENGINE_VERSION, '23.19.4.1');
assert.equal(ENGINE_PROTOCOL_VERSION, 'mp-23.19.1');
assert.equal(FIRESTORE_RULES_VERSION, '23.13.78');
assert.equal(manifest.engineVersion, '23.19.4.1');
assert.equal(manifest.engineProtocolVersion, 'mp-23.19.1');
assert.equal(manifest.firestoreRulesVersion, '23.13.78');
assert.equal(manifest.pool, 880);

// El pending nuevo debe conservar dificultad; el pending legacy sigue siendo válido.
assert.match(rewards, /difficulty:\s*reward\.mode === 'multiplayer'/);
assert.match(turn, /difficulty:\s*mode === 'solo' \? String\(state\.botDifficulty/);
assert.match(turn, /game_reward_queued[\s\S]*difficulty:/);

// Settlement Solo usa gameConfig y no una matriz hardcodeada en cliente.
assert.match(firebase, /function normalizeSoloRewardConfig/);
assert.match(firebase, /winVsTanoFacil/);
assert.match(firebase, /winVsTanoMedio/);
assert.match(firebase, /winVsTanoDificil/);
assert.match(firebase, /SOLO_REWARD_CONFIG_MISMATCH/);
assert.match(firebase, /storedDifficulty = requestedDifficulty \|\| 'legacy'/);

// PvP usa la misma configuración Admin que el cliente; no puede quedar congelado en 120/20.
assert.match(ui, /POINTS\.winVsHumano/);
assert.match(ui, /POINTS\.lossVsHumano/);
assert.match(ui, /pointsAreValidIntegers/);

// Caja Negra cruza receipts reales y sólo ofrece reparación Solo cuando hay resultado registrado.
assert.match(proxy, /fetchGameRewardAuditForAdmin/);
assert.match(proxy, /adminRepairSoloGameReward/);
assert.match(firebase, /collection\(db, 'playerGameReceipts'\)/);
assert.match(firebase, /collection\(db, 'gameRewardReceipts'\)/);
assert.match(firebase, /rewardReason: 'admin_repair'/);
assert.match(firebase, /telemetry\.status !== 'completed'/);
assert.match(firebase, /game_reward_admin_repair/);
assert.match(ui, /<th>Resultado<\/th><th>Recompensa<\/th>/);
assert.match(ui, /Acreditar manualmente/);
assert.match(ui, /playerGameReceipt registrado/);
assert.match(ui, /adminRepairSoloGameReward/);

// Rules privadas se verifican sólo cuando el gate de artefactos provee la ruta; nunca
// se publican dentro del GitHubSource.
if (rulesPath) {
  const rules = fs.readFileSync(rulesPath, 'utf8');
  assert.match(rules, /23\.13\.77 — SOLO REWARD SETTLEMENT INTEGRITY/);
  assert.match(rules, /function soloWinEasyPoints\(\)/);
  assert.match(rules, /function soloWinMediumPoints\(\)/);
  assert.match(rules, /function soloWinHardPoints\(\)/);
  assert.match(rules, /function soloLegacyBaseMatches/);
  assert.match(rules, /function pvpWinPoints\(\)/);
  assert.match(rules, /function pvpLossPoints\(\)/);
  assert.match(rules, /d\.baseDelta == pvpWinPoints\(\)/);
  assert.match(rules, /d\.baseDelta == pvpLossPoints\(\)/);
  assert.doesNotMatch(rules, /d\.baseDelta == 120/);
  assert.doesNotMatch(rules, /d\.baseDelta == 20/);
  assert.match(rules, /let hasDifficulty = d\.keys\(\)\.hasAny\(\['difficulty'\]\)/);
  assert.doesNotMatch(rules, /d\.baseDelta in \[15,50,100\]/);
  assert.match(rules, /function validAdminSoloGameRewardRepair/);
  assert.match(rules, /get\(telemetryPath\)\.data\.ownerUid == d\.uid/);
  assert.match(rules, /get\(telemetryPath\)\.data\.status == 'completed'/);
  assert.match(rules, /get\(gameResultPath\)\.data\.result == d\.outcome/);
  assert.match(rules, /gameRewardTargetUserDeltaValid\(d\.uid, d\.effectiveDelta\)/);
  assert.match(rules, /validGameRewardReceiptCreate\(rewardId\) \|\| validAdminSoloGameRewardRepair\(rewardId\)/);
  assert.match(rules, /'23\.13\.77'/);
}

// Privacidad del Tano de 23.19 sigue sellada.
assert.doesNotMatch(read('js/deckIntelligence.js'), /console\.log\([^\n]*Deck Intelligence/i);

console.log('REWARD_SETTLEMENT_INTEGRITY_23_19_2_OK config=dynamic-solo+pvp legacyHard=compatible blackBox=result+receipt adminRepair=solo+idempotent rules=23.13.78 pool=880 protocol=mp-23.19.1');
