import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOT_DIFFICULTIES, BOT_DIFFICULTY_PROFILES, normalizeBotDifficulty,
  botDifficultyLabel, botDeckQuality, botHasCapability, nextBotDifficulty
} from '../js/botDifficulty.js';
import { chooseHardAttackPlan, chooseHardBlockPlan, COMBAT_BOT_2_VERSION } from '../js/combatBot2.js';
import { POINTS, pointsForBotGameEnd, getDefaultGameConfig, applyGameConfig } from '../js/store.js';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { CURRENT_POOL_MILESTONE, POOL_BASELINE } from '../js/poolContract.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

assert.ok(['23.17.2','23.17.3','23.18.3','23.19','23.19.2','23.19.4.4'].includes(ENGINE_VERSION));
assert.equal(COMBAT_BOT_2_VERSION,'23.17.2');
assert.ok(['mp-23.10.0','mp-23.19.0','mp-23.19.1'].includes(ENGINE_PROTOCOL_VERSION));
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(CURRENT_POOL_MILESTONE,'pool_expansion_viii_880');
assert.equal(POOL_BASELINE.total,880);

assert.deepEqual(BOT_DIFFICULTIES,['easy','medium','hard']);
assert.equal(normalizeBotDifficulty('garbage'),'medium');
assert.equal(botDifficultyLabel('easy'),'Fácil');
assert.equal(botDifficultyLabel('medium'),'Medio');
assert.equal(botDifficultyLabel('hard'),'Difícil');
assert.equal(nextBotDifficulty('easy'),'medium');
assert.equal(nextBotDifficulty('medium'),'hard');
assert.equal(nextBotDifficulty('hard'),'easy');
assert.equal(botDeckQuality('easy'),'good');
assert.equal(botDeckQuality('medium'),'strong');
assert.equal(botDeckQuality('hard'),'elite');

// MEDIO freezes every capability that belonged to old Hard; only new Hard gets combat2.
for (const capability of ['reactiveStack','combatTricks','fightTrades','strategicMainPhase','strategicDiscard']) {
  assert.equal(botHasCapability('medium',capability),true,`medium must preserve old-hard ${capability}`);
  assert.equal(botHasCapability('hard',capability),true,`hard must retain ${capability}`);
  assert.equal(botHasCapability('easy',capability),false,`easy remains easy for ${capability}`);
}
assert.equal(botHasCapability('medium','combat2'),false);
assert.equal(botHasCapability('hard','combat2'),true);

// Economy defaults + legacy migration.
const defaults=getDefaultGameConfig();
assert.equal(defaults.winVsTanoFacil,50);
assert.equal(defaults.winVsTanoMedio,100);
assert.equal(defaults.winVsTanoDificil,200);
applyGameConfig({winVsTanoFacil:50,winVsTanoDificil:111}); // legacy document: old Hard => new Medium
assert.equal(POINTS.winVsTanoFacil,50);
assert.equal(POINTS.winVsTanoMedio,111);
assert.equal(POINTS.winVsTanoDificil,200);
applyGameConfig({winVsTanoFacil:51,winVsTanoMedio:101,winVsTanoDificil:201});
assert.equal(pointsForBotGameEnd(true,'easy'),51);
assert.equal(pointsForBotGameEnd(true,'medium'),101);
assert.equal(pointsForBotGameEnd(true,'hard'),201);
assert.equal(pointsForBotGameEnd(false,'hard'),POINTS.lossVsTano);

// Pure public-board Combat 2.0 probes.
const unit=(name,p,t,keywords=[])=>({card:{name,rarity:'Common'},p,t,keywords});
const helpers={
  getPower:u=>u.p,
  getToughness:u=>u.t,
  hasKeyword:(u,k)=>u.keywords.includes(k),
  canBlock:()=>true,
  predictDuel:(a,b)=>({attackerDies:b.p>=a.t,blockerDies:a.p>=b.t})
};
const suicidal=chooseHardAttackPlan({
  eligibleAttackers:[{unit:unit('Atacante',5,5),index:0}],
  defenders:[{unit:unit('Defensor',6,6),index:0}],
  botLife:20,opponentLife:20,helpers
});
assert.deepEqual(suicidal.indexes,[],'Hard must be allowed to hold back a globally bad attack');

const lethal=chooseHardAttackPlan({
  eligibleAttackers:[{unit:unit('A',5,5),index:0},{unit:unit('B',5,5),index:1}],
  defenders:[],botLife:20,opponentLife:9,helpers
});
assert.deepEqual(lethal.indexes.sort(),[0,1]);
assert.equal(lethal.reason,'lethal');
assert.ok(lethal.damage>=9);

const gang=chooseHardBlockPlan({
  attackers:[{unit:unit('Gigante',6,6),index:0}],
  blockers:[{unit:unit('Bloq 1',3,3),index:0},{unit:unit('Bloq 2',3,3),index:1}],
  botLife:5,opponentLife:20,helpers
});
assert.deepEqual(gang.assignment,[0,0],'Hard can discover a double block globally');
assert.equal(gang.damage,0);

const combat2=read('js/combatBot2.js');
assert.ok(!combat2.includes("from './main.js'"),'Combat 2.0 must not import hidden game state');
assert.ok(combat2.includes('información PÚBLICA') || combat2.includes('información PÚBLICA'.normalize('NFD')));
const bot=read('js/bot.js');
assert.ok(bot.includes("botHasCapability(state.botDifficulty, 'combat2')"));
assert.ok(bot.includes("recordTelemetryEvent('bot_combat2_attack_plan'"));
const combatRules=read('js/combatRules.js');
assert.ok(combatRules.includes('chooseHardBlockPlan'));
assert.ok(combatRules.includes("botHasCapability(state.botDifficulty, 'combat2')"));
const main=read('js/main.js');
assert.ok(main.includes("botDifficulty: 'medium'"),'default must preserve old Hard behavior under its new Medium name');
assert.ok(main.includes('botDeckQuality(state.botDifficulty)'));
const ui=read('js/ui.js');
assert.ok(ui.includes('nextBotDifficulty'));
assert.ok(ui.includes("id: 'winVsTanoMedio'"));
assert.ok(ui.includes("id: 'winVsTanoDificil'"));
const store=read('js/store.js');
assert.ok(store.includes('winVsTanoMedio: 100'));
assert.ok(store.includes('winVsTanoDificil: 200'));
const workflow=read('../.github/workflows/pages.yml');
// Workflow is switched to 23.17.2 before freeze.
assert.ok(workflow.includes('test_prebuilt_decks_store_23_17_3.mjs'));
assert.ok(workflow.includes('regression_legacy_23_17_3_1.zip'));
assert.ok(workflow.includes('ci_regression_manifest_23_17_3_1.txt'));

console.log('PASS test_tano_difficulty_combat_bot_23_17_2.mjs · Pool 880 · Easy/Medium/Hard profiles + good/strong/elite decks + 50/100/200 economy + global attack/block Combat Bot 2.0');
