import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { DAILY_REWARD_SCHEDULE, dailyRewardTotals } from '../../functions/src/economy/dailyCore.js';
import { normalizeMatchRewardConfig } from '../../functions/src/economy/matchCore.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const ambient=read('../functions/src/community/bots.js');
const ui=read('js/ui.js');

// Public bot balances must be constructible from real game economy operations, never random integers.
assert.match(ambient,/AMBIENT_ECONOMY_MODEL_VERSION\s*=\s*3/);
assert.match(ambient,/normalizeMatchRewardConfig/);
assert.match(ambient,/dailyRewardForDay/);
assert.match(ambient,/dailyRewardTotals/);
assert.match(ambient,/multiplayerWins[\s\S]*?rewardConfig\?\.pvp\?\.win/);
assert.match(ambient,/multiplayerLosses[\s\S]*?rewardConfig\?\.pvp\?\.loss/);
assert.match(ambient,/ambientEconomyModelVersion:AMBIENT_ECONOMY_MODEL_VERSION/);
assert.doesNotMatch(ambient,/40\s*\+\s*\(hashInt\('daily-points'/,'legacy arbitrary daily point generator must be gone');
assert.match(ambient,/pointsEarned:rewardA/,'simulated match result must create the same point statistic that it creates in the profile');
assert.match(ambient,/pointsEarned:totals\.points/,'simulated Daily must use the real Daily reward table');
assert.match(ambient,/const games=await simulateBotGames[\s\S]*?const market=await advanceBotMarket/,'profile-changing game and Market ticks must be ordered, not raced');
assert.doesNotMatch(ambient,/Promise\.all\(\[simulateBotGames\(db,cfg,nowMs\),advanceBotMarket/);

// Defaults themselves are reachable and no fake +1 point source exists in the ambient model.
const matchCfg=normalizeMatchRewardConfig({});
assert.equal(matchCfg.pvp.win,120);
assert.equal(matchCfg.pvp.loss,20);
const dailyPointDeltas=DAILY_REWARD_SCHEDULE.map(row=>dailyRewardTotals(row.rewards).points).filter(Boolean);
assert.deepEqual(dailyPointDeltas,[30,30,30,60,100]);
assert.ok([...dailyPointDeltas,matchCfg.pvp.win,matchCfg.pvp.loss].every(n=>Number.isInteger(n)&&n>=15));

// Ambient Market posts expire independently and only idle posts are churned.
assert.match(ambient,/listingLifetimeMinMinutes:clampInt\(raw\.listingLifetimeMinMinutes, 90, 15, 1440\)/);
assert.match(ambient,/listingLifetimeMaxMinutes:Math\.max/);
assert.match(ambient,/hashInt\('listing-life',uid,listing\.listingId\|\|'',listing\.cardId\|\|''\)/);
assert.match(ambient,/offerCount\)\|\|0\)\)===0/,'pending offers fence listing churn');
assert.match(ambient,/cancelTradeListingTx\(\{db,tx,uid,listingId:stale\[0\]\.listingId,nowMs\}\)/);
assert.match(ambient,/ambient_listing_\$\{uid\}_\$\{nowMs\}_\$\{cardId\}/,'renewed listing ids must be unique across churn cycles');
assert.match(ui,/admin-community-bots-listing-life-min/);
assert.match(ui,/admin-community-bots-listing-life-max/);
assert.match(ui,/Sólo se renueva si no tiene ofertas pendientes/);

console.log('AMBIENT_POPULATION_REALISM_II_23_21_6_HF23_3_6_OK market=STAGGERED_CHURN+PENDING_OFFER_FENCE points=REAL_PVP+REAL_DAILY legacyImpossibleBalances=REPAIRED profileMutations=SERIALIZED');
