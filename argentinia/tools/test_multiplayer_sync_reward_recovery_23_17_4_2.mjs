import fs from 'node:fs';
import assert from 'node:assert/strict';

const impl = fs.readFileSync(new URL('../js/firebaseClientImpl.js', import.meta.url), 'utf8');
const version = fs.readFileSync(new URL('../js/version.js', import.meta.url), 'utf8');
const texts = fs.readFileSync(new URL('../js/gameTexts.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const rulesPath = process.env.ARGENTINIA_FIRESTORE_RULES || new URL('../../FIRESTORE_RULES_COMPLETAS_ENTREGA_23_13_75_PVP_SETTLEMENT_BUDGET_V2.rules', import.meta.url);
const rules = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf8') : '';

assert.match(version, /Entrega 23\.17\.4\.2 Multiplayer Sync \+ PvP Reward Recovery Hotfix/);
assert.match(version, /FIRESTORE_RULES_VERSION = '23\.13\.76'/);
assert.ok(impl.includes('gameOver: false,'), 'createMatch debe sembrar gameOver:false.');
assert.ok(impl.includes('abandonedBy: null,'), 'createMatch debe sembrar abandonedBy:null.');
if (rules) {
  assert.ok(rules.includes("!oldHasField && nextGameOver == false"), 'Rules no aceptan init neutral legacy gameOver missing→false.');
  assert.ok(rules.includes("!oldHasField && nextValue == null"), 'Rules no aceptan init neutral legacy abandonedBy missing→null.');
  assert.ok(rules.includes('function validGameRewardReceiptCreate(rewardId)'), 'Falta router de receipts de reward.');
  assert.ok(rules.includes('function validPvpGameRewardReceiptV2(rewardId)'), 'Falta settlement PvP V2 central.');
  assert.ok(rules.includes('function pvpPairHasSupportingReceiptAfter'), 'Ledger por pareja no delega evidencia al receipt.');
  assert.ok(rules.includes('function pvpDailyHasSupportingReceiptAfter'), 'Ledger diario no delega evidencia al receipt.');
  assert.ok(rules.includes("'23.13.76'"), 'rewardClock no admite attestation 23.13.75.');
  assert.ok(rules.includes("resource == null || resource.data.uidA == request.auth.uid"), 'Ledger de pareja inexistente sigue dereferenciando resource.data.');
  assert.ok(rules.includes("resource == null || resource.data.uid == request.auth.uid"), 'Ledger diario inexistente sigue dereferenciando resource.data.');
  assert.ok(rules.includes("receiptId.matches('^' + request.auth.uid + '_.*')"), 'playerGameReceipts get no usa autorización por ID.');
}

assert.ok(texts.includes('el resultado final puede ser 0 puntos si corresponde por las reglas anti-farming'), 'Mensaje deferred sigue prometiendo puntos.');
assert.ok(main.includes('recoveredRewardNotice'), 'Bootstrap no da feedback visible de liquidaciones recuperadas.');
assert.ok(main.includes("game.points.recoveredZero"), 'Bootstrap no informa settlement recuperado de 0 puntos.');
assert.ok(texts.includes("'game.points.recoveryPending'"), 'Falta texto visible para liquidaciones que siguen pendientes.');
console.log('MULTIPLAYER_SYNC_REWARD_RECOVERY_23_17_4_2_OK liveNeutralInit=yes legacyInit=yes settlement=v2-receipt-authority rules=23.13.76');
