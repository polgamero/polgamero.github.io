import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ECONOMY_PROTOCOL_VERSION, ECONOMY_SCHEMA_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { DAILY_REWARD_SCHEDULE as CLIENT_SCHEDULE, advanceDailyLoginState } from '../js/rewards.js';
import {
  DAILY_REWARDS_SCHEMA_VERSION,
  DAILY_REWARD_SCHEDULE as SERVER_SCHEDULE,
  advanceDailyState,
  dailyDateKey,
  buildDailyCampaignEffects,
  effectiveDailyRewards,
  dailyRewardTotals
} from '../../functions/src/economy/dailyCore.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const repo=path.resolve(root,'..');
const read=p=>fs.readFileSync(path.join(repo,p),'utf8');

assert.equal(ENGINE_VERSION,'23.19.5.5');
assert.equal(ECONOMY_PROTOCOL_VERSION,'econ-23.19.5.5');
assert.equal(ECONOMY_SCHEMA_VERSION,6);
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(DAILY_REWARDS_SCHEMA_VERSION,4);
assert.deepEqual(SERVER_SCHEDULE,CLIENT_SCHEDULE,'server/client Daily schedule drift');
assert.deepEqual(SERVER_SCHEDULE.map(x=>x.day),[1,2,3,4,5,6,7]);
assert.deepEqual(SERVER_SCHEDULE[5].rewards,[{type:'standardPack',amount:1},{type:'points',amount:100}]);
assert.deepEqual(SERVER_SCHEDULE[6].rewards,[{type:'guaranteedMythic',amount:1}]);

const stamp=day=>new Date(`2026-08-${String(day).padStart(2,'0')}T00:00:00.000Z`);
const d3={schemaVersion:4,serverCycleStartDay:stamp(27),serverPreviousLoginDay:stamp(28),serverLastLoginDay:stamp(29),serverUpdatedAt:stamp(29),streak:3,unlockedDays:[1,2,3],claimedDays:[1,2],lastClaimedDay:2};
const d4=advanceDailyState(d3,new Date('2026-08-30T15:00:00.000Z'));
assert.equal(d4.state.streak,4); assert.equal(d4.state.previousLoginDate,'2026-08-29'); assert.equal(d4.rewardDay,4);
const gap=advanceDailyState(d3,new Date('2026-09-01T15:00:00.000Z'));
assert.equal(gap.state.streak,1); assert.equal(gap.streakReset,true); assert.deepEqual(gap.state.claimedDays,[]);
const d7={schemaVersion:4,serverCycleStartDay:stamp(24),serverPreviousLoginDay:stamp(29),serverLastLoginDay:stamp(30),serverUpdatedAt:stamp(30),streak:7,unlockedDays:[1,2,3,4,5,6,7],claimedDays:[1,2,3,4,5,6,7],lastClaimedDay:7};
const cycle=advanceDailyState(d7,new Date('2026-08-31T15:00:00.000Z'));
assert.equal(cycle.state.streak,1); assert.equal(cycle.cycleCompleted,true);
assert.equal(dailyDateKey(new Date('2026-09-03T02:30:00.000Z')),'2026-09-02','ART day boundary must be server-owned');

// Cross-check old pure client transition while it remains display/test domain only.
const clientD4=advanceDailyLoginState(d3,new Date('2026-08-30T15:00:00.000Z'));
assert.equal(clientD4.state.streak,d4.state.streak);
assert.equal(clientD4.state.previousLoginDate,d4.state.previousLoginDate);

const events=[
  {id:'points',type:'all_points_multiplier',value:2,startAt:new Date(1),endAt:new Date(Date.now()+60000)},
  {id:'fichas',type:'all_fichas_multiplier',value:3,startAt:new Date(1),endAt:new Date(Date.now()+60000)},
  {id:'pack-discount-ignored',type:'pack_discount',value:90,startAt:new Date(1),endAt:new Date(Date.now()+60000)},
  {id:'pack-bonus-ignored',type:'pack_open_ficha_bonus',value:7,startAt:new Date(1),endAt:new Date(Date.now()+60000)}
];
const effects=buildDailyCampaignEffects(events);
assert.deepEqual(effects,{allPointsMultiplier:2,allFichasMultiplier:3,activeEventIds:['points','fichas']});
const d6Rewards=effectiveDailyRewards(SERVER_SCHEDULE[5],effects);
assert.deepEqual(d6Rewards,[{type:'standardPack',amount:1},{type:'points',amount:200}]);
assert.deepEqual(dailyRewardTotals(d6Rewards),{points:200,fichas:0,standardPacks:1,guaranteedMythics:0});
const d4Rewards=effectiveDailyRewards(SERVER_SCHEDULE[3],effects);
assert.deepEqual(d4Rewards,[{type:'fichas',amount:3}]);

const fnIndex=read('functions/src/index.js');
const daily=read('functions/src/economy/daily.js');
const client=read('argentinia/js/economyClient.js');
const impl=read('argentinia/js/firebaseClientImpl.js');
const recovery=read('argentinia/js/economyActionRecovery.js');
const facade=read('argentinia/js/firebaseClient.js');

for(const fn of ['economyRegisterDailyLogin','economyClaimDailyReward','economyAdminDailyDebug']) assert.match(fnIndex,new RegExp(`export const ${fn}\\s*=`),`${fn} missing`);
for(const capability of ['dailyRewardsAuthority','dailyClockAuthority']) assert.match(fnIndex,new RegExp(`${capability}: 'server'`));
assert.match(fnIndex,/dailyClaimRecovery: true/);
assert.match(fnIndex,/type: 'daily\.claim'/);
assert.match(fnIndex,/rejectForbidden\(data, \['uid','nowMs','date','streak','dailyRewards','points','fichas','inventory','rewards'/);
assert.match(fnIndex,/if \(!isAdminAuth\(auth\)\) throw economyError\('ADMIN_REQUIRED'\)/);
assert.match(daily,/Date\.now\(\)/);
assert.match(daily,/dailyDateKey\(clock\.effectiveNow\)/);
assert.match(daily,/serializeDailyState\(nextDaily,new Date\(serverNowMs\)\)/);
assert.match(daily,/FieldValue\.serverTimestamp\(\)/);
assert.match(daily,/loadDailyCampaignEffects/);
assert.match(daily,/allPointsMultiplier/);
assert.match(daily,/allFichasMultiplier/);
assert.doesNotMatch(daily,/packDiscountPercent|packOpenFichaBonus/,'Daily campaign authority leaked unrelated effects');
for(const fn of ['economyRegisterDailyLogin','economyClaimDailyReward','economyAdminDailyDebug']) assert.match(client,new RegExp(`'${fn}'`));
assert.match(impl,/registerDailyLoginServer\(\)/);
assert.match(impl,/claimDailyRewardServer\(request\.day, operationId\)/);
assert.match(impl,/adminDailyDebugServer\(mode\)/);
assert.match(recovery,/dailyClaim/);
const dailyClientBlock=impl.slice(impl.indexOf('// 23.19.5.4 — DAILY REWARDS AUTHORITY.'),impl.indexOf('// Craftea una mejora permanente'));
assert.doesNotMatch(dailyClientBlock,/runTransaction\(|tx\.update\(|applyRewardToProfileData|advanceDailyLoginState/,'official Daily client path still owns mutation');
assert.match(dailyClientBlock,/DAILY_CLIENT_CLOCK_DISABLED/,'client-supplied Daily clock must be rejected');

// Systemic lazy-facade parity remains mandatory.
const lazyTargets=[...facade.matchAll(/asyncProxy\('([^']+)'\)/g)].map(m=>m[1]);
const implExports=new Set([
  ...[...impl.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(m=>m[1]),
  ...[...impl.matchAll(/export\s+(?:const|let|class)\s+(\w+)/g)].map(m=>m[1])
]);
assert.deepEqual(lazyTargets.filter(name=>!implExports.has(name)),[],'firebase lazy facade drift');

const manifest=JSON.parse(read('argentinia/build-manifest.json'));
assert.equal(manifest.engineVersion,'23.19.5.5');
assert.equal(manifest.economyProtocolVersion,'econ-23.19.5.5');
assert.equal(manifest.economySchemaVersion,6);

console.log('DAILY_REWARDS_AUTHORITY_23_19_5_3_OK login=SERVER_CLOCK claim=IDEMPOTENT campaigns=SERVER adminDebug=SERVER recovery=OPERATION_ID schedule=PARITY');
