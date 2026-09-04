import assert from 'node:assert/strict';
import { canonicalJson, requestDigest, seededRng } from '../src/shared/canonical.js';
import { validateUsername, usernameKeyFromName } from '../src/economy/usernames.js';
import { TRUSTED_CARD_POOL, TRUSTED_CARD_POOL_FINGERPRINT } from '../src/trusted/cardCatalog.js';
import { DECK_INTELLIGENCE_VERSION, buildCompetitiveDeck, getArchetypeDefinition, validateCompetitiveDeck } from '../src/trusted/deckIntelligence.js';

assert.equal(canonicalJson({b:2,a:1}),'{"a":1,"b":2}');
assert.equal(requestDigest({a:1,b:2}),requestDigest({b:2,a:1}));
assert.notEqual(requestDigest({a:1}),requestDigest({a:2}));

const good=validateUsername('Pibe del Sur');
assert.equal(good.ok,true);
assert.equal(good.usernameKey,usernameKeyFromName('Pibe del Sur'));
assert.equal(validateUsername('admin').ok,false);
assert.equal(validateUsername('x').ok,false);

assert.equal(TRUSTED_CARD_POOL.length,880);
assert.equal(DECK_INTELLIGENCE_VERSION,'23.19.5-di2');
assert.match(TRUSTED_CARD_POOL_FINGERPRINT,/^[a-f0-9]{64}$/);

const build=(seed)=>{
  const rng=seededRng(seed);
  const result=buildCompetitiveDeck(TRUSTED_CARD_POOL,['W','U'],{quality:'starter',rng,candidateCount:20,goldfishIterations:16});
  assert.equal(result.deck.length,60);
  assert.equal(validateCompetitiveDeck(result.deck,['W','U']).ok,true);
  const def=getArchetypeDefinition(result.report.archetypeId);
  assert.ok(result.report.creatureCount>=def.creatureFloor,`trusted starter creature floor ${result.report.creatureCount}/${def.creatureFloor}`);
  assert.ok(result.report.vehicleCount<=def.maxVehicles,`trusted starter vehicle cap ${result.report.vehicleCount}/${def.maxVehicles}`);
  return result.deck.map(c=>c.id);
};
assert.deepEqual(build('same-operation'),build('same-operation'));
assert.notDeepEqual(build('same-operation'),build('different-operation'));

console.log('ECONOMY_FUNCTIONS_FOUNDATION_UNIT_OK');

const packs = await import('../src/economy/packCore.js');
const packA = packs.generateTrustedPack({ seed: 'unit-pack', mythicChance: 0 });
assert.equal(packA.cardIds.length, 15);
assert.equal(packA.rareSlotRarity, 'Rare');
const byId = new Map(TRUSTED_CARD_POOL.map(card => [card.id, card]));
assert.ok(packA.cardIds.slice(0,9).every(id => byId.get(id)?.rarity === 'Common'));
assert.ok(packA.cardIds.slice(9,13).every(id => byId.get(id)?.rarity === 'Uncommon'));
assert.equal(byId.get(packA.cardIds[13])?.rarity, 'Rare');
assert.ok(String(byId.get(packA.cardIds[14])?.type || '').toLowerCase().includes('tierra'));
const packM = packs.generateTrustedPack({ seed: 'unit-pack-mythic', mythicChance: 1 });
assert.equal(packM.rareSlotRarity, 'Mythic');
assert.equal(byId.get(packM.cardIds[13])?.rarity, 'Mythic');
const guaranteed = packs.generateTrustedGuaranteedMythic({ seed: 'unit-guaranteed' });
assert.equal(byId.get(guaranteed)?.rarity, 'Mythic');
assert.equal(packs.effectivePackOpenFichas({ allFichasMultiplier: 2, packOpenFichaBonus: 3 }), 5);

const commerceCore = await import('../src/economy/commerceCore.js');
const prebuilt = await import('../src/trusted/prebuiltCatalog.js');
assert.equal(prebuilt.TRUSTED_PREBUILT_PRODUCTS.length, 10);
assert.ok(prebuilt.TRUSTED_PREBUILT_PRODUCTS.every(product => product.cardIds.length === 60));
assert.equal(commerceCore.ENHANCEMENT_KEYWORDS.length, 10);
const commerceSettings = commerceCore.normalizeStoreSettings({ packCost: 200, fichasPerEnhancement: 4, prebuiltDeckPoints: 1700, prebuiltDeckFichas: 5, maxSavedDecks: 13 });
assert.equal(commerceSettings.packCost, 200);
assert.equal(commerceSettings.craftCost, 4);
assert.equal(commerceCore.effectivePackPurchaseCost(200, { packDiscountPercent: 50 }), 100);
assert.equal(commerceCore.argentinaWeekKey(Date.parse('2026-09-02T15:00:00Z')), '2026-08-31');
assert.equal(commerceCore.nextArgentinaWeekRotationIso(Date.parse('2026-09-02T15:00:00Z')), '2026-09-07T03:00:00.000Z');

const dailyCore = await import('../src/economy/dailyCore.js');
assert.equal(dailyCore.DAILY_REWARD_SCHEDULE.length,7);
assert.equal(dailyCore.dailyDateKey(new Date('2026-09-03T02:30:00.000Z')),'2026-09-02');
const dailyFx=dailyCore.buildDailyCampaignEffects([
  {id:'p',type:'all_points_multiplier',value:2,startAt:new Date(1),endAt:new Date(Date.now()+60000)},
  {id:'f',type:'all_fichas_multiplier',value:3,startAt:new Date(1),endAt:new Date(Date.now()+60000)},
  {id:'ignored',type:'pack_discount',value:50,startAt:new Date(1),endAt:new Date(Date.now()+60000)}
]);
assert.deepEqual(dailyFx,{allPointsMultiplier:2,allFichasMultiplier:3,activeEventIds:['p','f']});
assert.deepEqual(dailyCore.effectiveDailyRewards(dailyCore.DAILY_REWARD_SCHEDULE[5],dailyFx),[
  {type:'standardPack',amount:1},{type:'points',amount:200}
]);
const dailyD1=dailyCore.advanceDailyState(null,new Date('2026-09-02T15:00:00.000Z'));
assert.equal(dailyD1.state.streak,1);
assert.equal(dailyD1.rewardDay,1);
console.log('ECONOMY_DAILY_23_19_5_3_UNIT_OK');


const admissionCore = await import('../src/economy/admissionCore.js');
assert.deepEqual(admissionCore.normalizeAdmissionPolicy({registrationMode:'limited',maxRegisteredUsers:500,maxRegistrationsPerDay:50}),{
  registrationMode:'limited',maxRegisteredUsers:500,maxRegistrationsPerDay:50
});
assert.equal(admissionCore.evaluateAdmission({policy:{registrationMode:'limited',maxRegisteredUsers:2},registeredUsers:2}).reason,'capacity');
assert.equal(admissionCore.evaluateAdmission({policy:{registrationMode:'limited',maxRegistrationsPerDay:3},registrationsToday:3}).reason,'daily_limit');
assert.equal(admissionCore.evaluateAdmission({policy:{registrationMode:'paused'}}).reason,'paused');
assert.equal(admissionCore.argentinaAdmissionDayKey(Date.parse('2026-09-03T02:30:00.000Z')),'2026-09-02');

const matchCore = await import('../src/economy/matchCore.js');
const rewardCfg=matchCore.normalizeMatchRewardConfig({});
assert.deepEqual(rewardCfg.solo,{easy:50,medium:100,hard:200,loss:15});
assert.deepEqual(rewardCfg.pvp,{win:120,loss:20});
assert.equal(rewardCfg.abandonPenalty,-30);
const early=matchCore.evaluatePvpRewardEligibility({terminalKind:'abandon',durationMs:60000,turnCountAtEnd:3,requestedDelta:120});
assert.equal(early.rewardable,false);
assert.equal(early.reason,'early_abandon');
const pairCap=matchCore.evaluatePvpRewardEligibility({terminalKind:'natural',durationMs:300000,turnCountAtEnd:8,pairRewardedCount:5,requestedDelta:120});
assert.equal(pairCap.reason,'pair_limit');
const partial=matchCore.evaluatePvpRewardEligibility({terminalKind:'natural',durationMs:300000,turnCountAtEnd:8,pairRewardedCount:0,dailyPointsAwarded:1150,requestedDelta:120});
assert.equal(partial.reason,'daily_cap_partial');
assert.equal(partial.appliedDelta,50);
const matchFx=matchCore.normalizeMatchCampaignEffects([
  {id:'points',type:'all_points_multiplier',value:2,startAt:new Date(1),endAt:new Date(Date.now()+60000)},
  {id:'ignored-pack',type:'pack_discount',value:50,startAt:new Date(1),endAt:new Date(Date.now()+60000)},
  {id:'ignored-fichas',type:'all_fichas_multiplier',value:3,startAt:new Date(1),endAt:new Date(Date.now()+60000)}
]);
assert.deepEqual(matchFx,{allPointsMultiplier:2,activeEventIds:['points']});
assert.equal(matchCore.effectiveMatchRewardPoints(120,matchFx),240);
assert.equal(matchCore.deriveSoloAbandonReceiptId('abandon:solo:solo_gate_2355:user_abc','user_abc'),'solo_gate_2355');
assert.equal(matchCore.deriveSoloAbandonReceiptId('abandon:solo:wrong:user_abc','other_uid'),'');
assert.equal(matchCore.normalizeAbandonDurationMs(-5),0);
assert.equal(matchCore.normalizeAbandonDurationMs(999999999),24*60*60*1000);
console.log('ECONOMY_MATCH_ADMISSION_23_19_5_4_UNIT_OK');
