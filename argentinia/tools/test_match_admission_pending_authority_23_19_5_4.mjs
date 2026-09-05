import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ECONOMY_PROTOCOL_VERSION, ECONOMY_SCHEMA_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { normalizeAdmissionPolicy, evaluateAdmission, argentinaAdmissionDayKey } from '../../functions/src/economy/admissionCore.js';
import { normalizeMatchRewardConfig, normalizePvpRewardLimits, evaluatePvpRewardEligibility, normalizeMatchCampaignEffects, effectiveMatchRewardPoints, argentinaMatchDayKey, pvpCompletedTurns } from '../../functions/src/economy/matchCore.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const repo=path.resolve(root,'..');
const read=p=>fs.readFileSync(path.join(repo,p),'utf8');

assert.equal(ENGINE_VERSION,'23.19.5.6');
assert.equal(ECONOMY_PROTOCOL_VERSION,'econ-23.19.5.6');
assert.equal(ECONOMY_SCHEMA_VERSION,7);
assert.equal(FIRESTORE_RULES_VERSION,'23.13.80');

// Admission policy: open never blocks; limited obeys both caps; paused blocks only new-account path.
assert.deepEqual(normalizeAdmissionPolicy({registrationMode:'limited',maxRegisteredUsers:500,maxRegistrationsPerDay:50}),{
  registrationMode:'limited',maxRegisteredUsers:500,maxRegistrationsPerDay:50
});
assert.equal(evaluateAdmission({policy:{registrationMode:'open',maxRegisteredUsers:1,maxRegistrationsPerDay:1},registeredUsers:999,registrationsToday:999}).allowed,true);
assert.equal(evaluateAdmission({policy:{registrationMode:'limited',maxRegisteredUsers:500,maxRegistrationsPerDay:50},registeredUsers:499,registrationsToday:49}).allowed,true);
assert.equal(evaluateAdmission({policy:{registrationMode:'limited',maxRegisteredUsers:500,maxRegistrationsPerDay:50},registeredUsers:500,registrationsToday:49}).reason,'capacity');
assert.equal(evaluateAdmission({policy:{registrationMode:'limited',maxRegisteredUsers:500,maxRegistrationsPerDay:50},registeredUsers:499,registrationsToday:50}).reason,'daily_limit');
assert.equal(evaluateAdmission({policy:{registrationMode:'paused'},registeredUsers:1,registrationsToday:0}).reason,'paused');
assert.equal(argentinaAdmissionDayKey(Date.parse('2026-09-03T02:59:59.000Z')),'2026-09-02');
assert.equal(argentinaAdmissionDayKey(Date.parse('2026-09-03T03:00:00.000Z')),'2026-09-03');

// Match authority preserves canonical economy defaults/migrations and server-owned anti-farming.
const cfg=normalizeMatchRewardConfig({winVsTanoFacil:50,winVsTanoMedio:100,winVsTanoDificil:200,lossVsTano:15,winVsHumano:120,lossVsHumano:20,abandonPenalty:-30});
assert.deepEqual(cfg.solo,{easy:50,medium:100,hard:200,loss:15});
assert.deepEqual(cfg.pvp,{win:120,loss:20});
assert.equal(cfg.abandonPenalty,-30);
assert.deepEqual(normalizePvpRewardLimits({}),{minRewardMinutes:3,minCompletedTurns:4,maxRewardedMatchesPerPairDaily:5,maxPointsPerDay:1200});
assert.equal(pvpCompletedTurns(5),4);
assert.equal(argentinaMatchDayKey(Date.parse('2026-09-03T02:59:59.000Z')),'2026-09-02');
const early=evaluatePvpRewardEligibility({terminalKind:'abandon',durationMs:2*60000,turnCountAtEnd:10,requestedDelta:120});
assert.equal(early.reason,'early_abandon'); assert.equal(early.appliedDelta,0);
const pair=evaluatePvpRewardEligibility({terminalKind:'natural',durationMs:1,turnCountAtEnd:2,pairRewardedCount:5,requestedDelta:120});
assert.equal(pair.reason,'pair_limit');
const capped=evaluatePvpRewardEligibility({terminalKind:'natural',durationMs:1,turnCountAtEnd:2,dailyPointsAwarded:1150,requestedDelta:120});
assert.equal(capped.reason,'daily_cap_partial'); assert.equal(capped.appliedDelta,50);
const now=Date.now();
const fx=normalizeMatchCampaignEffects([
  {id:'points',type:'all_points_multiplier',value:2,startAt:new Date(1),endAt:new Date(now+60000)},
  {id:'fichas-ignored',type:'all_fichas_multiplier',value:4,startAt:new Date(1),endAt:new Date(now+60000)},
  {id:'discount-ignored',type:'pack_discount',value:50,startAt:new Date(1),endAt:new Date(now+60000)}
],now);
assert.deepEqual(fx,{allPointsMultiplier:2,activeEventIds:['points']});
assert.equal(effectiveMatchRewardPoints(120,fx),240);

const fnIndex=read('functions/src/index.js');
const accounts=read('functions/src/economy/accounts.js');
const admission=read('functions/src/economy/admission.js');
const matches=read('functions/src/economy/matches.js');
const econClient=read('argentinia/js/economyClient.js');
const impl=read('argentinia/js/firebaseClientImpl.js');
const facade=read('argentinia/js/firebaseClient.js');
const rewards=read('argentinia/js/gameRewards.js');
const turn=read('argentinia/js/turnManager.js');
const main=read('argentinia/js/main.js');
const ui=read('argentinia/js/ui.js');
const username=read('argentinia/js/usernameUI.js');
const pending=read('argentinia/js/economyPending.js');

for(const fn of ['economyGetAdmissionStatus','economyAdminSetAdmissionPolicy','economySettleMatchReward','economyApplyAbandonPenalty']) {
  assert.match(fnIndex,new RegExp(`export const ${fn}\\s*=`),`${fn} missing`);
}
for(const capability of ['matchSettlementAuthority','pvpAntiFarmAuthority','registrationAdmissionAuthority']) assert.match(fnIndex,new RegExp(`${capability}: 'server'`));
for(const forbidden of ['baseDelta','effectiveDelta','points','limits','campaign','myRole']) assert.ok(fnIndex.includes(`'${forbidden}'`),'forged match field must be rejected');
assert.match(fnIndex,/sealMultiplayerOutcomeServer\(db, auth\.uid, rewardRequest\.matchId\)/);
assert.match(matches,/loadMatchCampaignEffects/);
assert.match(matches,/gameConfig\/settings/);
assert.match(matches,/pvpDailyPairs/);
assert.match(matches,/pvpDailyUsers/);
assert.match(matches,/authority:'server'/);

// Admission is inside account creation transaction and only executes when users/{uid} is absent.
assert.match(accounts,/reserveRegistrationAdmissionTx/);
const createBranch=accounts.slice(accounts.indexOf('} else {'),accounts.indexOf('tx.set(nameRef'));
assert.match(createBranch,/reserveRegistrationAdmissionTx/);
assert.match(admission,/tx\.get\(globalRef\)/);
assert.match(admission,/tx\.set\(globalRef/);
assert.match(admission,/REGISTRATION_CAPACITY_REACHED/);
assert.match(admission,/REGISTRATION_DAILY_LIMIT_REACHED/);
assert.match(admission,/REGISTRATION_PAUSED/);

// Official current client always bootstraps through Functions even while global economy mode is shadow.
const reserveBlock=impl.slice(impl.indexOf('export async function reserveInitialUsername'),impl.indexOf('export async function checkUsernameAvailability'));
assert.match(reserveBlock,/await bootstrapAccountServer\(validated\.username\)/);
assert.doesNotMatch(reserveBlock,/runTransaction\(|economyShouldUseServer|fallback legacy/);

// Current terminal reward path only sends intent. Client-local settlement helpers may remain as historical compatibility,
// but awardGamePointsOnce/flush route through settleMatchRewardServer.
const currentSettlement=impl.slice(impl.indexOf('async function settleGameRewardOnce'),impl.indexOf('// 23.13.0 — Comprar ya NO abre el sobre.'));
assert.match(currentSettlement,/settleMatchRewardServer/);
assert.doesNotMatch(currentSettlement,/settleSoloGameRewardOnce\(|settlePvpGameRewardOnce\(|effectiveMatchPoints\(/);
assert.match(rewards,/operationId:/);
assert.doesNotMatch(turn,/sealMultiplayerOutcome\(matchId\)/,'turn manager must not client-seal settlement');
assert.match(turn,/awardGamePointsOnce/);
assert.match(main,/applyAbandonPenalty/);
assert.doesNotMatch(main,/awardPoints\(state\.currentUser\.uid, POINTS\.abandonPenalty\)/);

for(const fn of ['economyGetAdmissionStatus','economyAdminSetAdmissionPolicy','economySettleMatchReward','economyApplyAbandonPenalty']) assert.match(econClient,new RegExp(`'${fn}'`));
for(const fn of ['getAdmissionStatus','adminSetAdmissionPolicy','applyAbandonPenalty']) assert.match(facade,new RegExp(`asyncProxy\\('${fn}'\\)`));

// Pending UX is centralized and used on all high-latency economy mutation surfaces.
assert.match(pending,/withEconomyButtonPending/);
assert.match(pending,/aria-busy/);
assert.match(pending,/CONECTANDO CON EL SERVIDOR/);
assert.match(ui,/withEconomyButtonPending/);
for(const label of ['ABRIENDO...','REVELANDO...','RECLAMANDO...','COMPRANDO...','MEJORANDO...','APLICANDO...']) assert.ok(ui.includes(label),`pending label missing: ${label}`);
assert.match(username,/withEconomyButtonPending/);
assert.ok(username.includes('CREANDO CUENTA...'));
assert.ok(username.includes('GUARDANDO...'));
assert.match(ui,/cfg-registrationMode/);
assert.match(ui,/cfg-maxRegisteredUsers/);
assert.match(ui,/cfg-maxRegistrationsPerDay/);
assert.match(ui,/adminSetAdmissionPolicy/);

// Systemic lazy-facade parity: every asyncProxy must exist in implementation.
const lazyTargets=[...facade.matchAll(/asyncProxy\('([^']+)'\)/g)].map(m=>m[1]);
const implExports=new Set([
  ...[...impl.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(m=>m[1]),
  ...[...impl.matchAll(/export\s+(?:const|let|class)\s+(\w+)/g)].map(m=>m[1])
]);
assert.deepEqual(lazyTargets.filter(name=>!implExports.has(name)),[],'firebase lazy facade drift');

const manifest=JSON.parse(read('argentinia/build-manifest.json'));
assert.equal(manifest.engineVersion,'23.19.5.6');
assert.equal(manifest.economyProtocolVersion,'econ-23.19.5.6');
assert.equal(manifest.economySchemaVersion,7);
assert.equal(manifest.firestoreRulesVersion,'23.13.80');

console.log('MATCH_ADMISSION_PENDING_AUTHORITY_23_19_5_4_OK settlement=SERVER antiFarm=SERVER admission=ATOMIC pendingUX=CENTRALIZED rules=UNCHANGED');
