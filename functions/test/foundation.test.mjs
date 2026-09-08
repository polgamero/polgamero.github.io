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


const eloCore = await import('../src/economy/eloCore.js');
assert.equal(eloCore.ELO_INITIAL_RATING,1200);
assert.equal(eloCore.ELO_MAX_RATED_PAIR_DAILY,5);
assert.deepEqual(eloCore.normalizeEloStats({}),{rating:1200,peak:1200,games:0,wins:0,losses:0});
const eloNew=eloCore.calculateEloChange({}, {}, 1);
assert.equal(eloNew.a.before,1200); assert.equal(eloNew.a.after,1220); assert.equal(eloNew.a.delta,20); assert.equal(eloNew.a.k,40);
assert.equal(eloNew.b.after,1180); assert.equal(eloNew.b.delta,-20);
const eloEstablished=eloCore.calculateEloChange({eloRating:1200,eloGames:10},{eloRating:1200,eloGames:10},1);
assert.equal(eloEstablished.a.after,1212); assert.equal(eloEstablished.a.k,24); assert.equal(eloEstablished.b.after,1188);
console.log('PVP_ELO_23_21_2_UNIT_OK initial=1200 provisionalK=40 establishedK=24 pairDailyCap=5');


const emotes = await import('../src/trusted/emoteCatalog.js');
const { readFileSync } = await import('node:fs');
const socialSource = readFileSync(new URL('../src/multiplayer/communication.js', import.meta.url),'utf8');
for (const contract of [
  'CHAT_MAX_CHARS = 220','COMMUNICATION_EVENT_CAP = 40','CHAT_MIN_INTERVAL_MS = 1500',
  'CHAT_BURST_WINDOW_MS = 15000','CHAT_BURST_MAX = 5','EMOTE_MIN_INTERVAL_MS = 4000',
  'EMOTE_BURST_WINDOW_MS = 20000','EMOTE_BURST_MAX = 3','COMMUNICATION_TTL_MS = 48 * 60 * 60 * 1000'
]) assert.ok(socialSource.includes(contract),`missing social contract ${contract}`);
assert.equal(emotes.TRUSTED_EMOTE_CATALOG.length,12);
assert.equal(emotes.TRUSTED_EMOTE_CATALOG.filter(e=>!e.premium).length,6);
assert.equal(emotes.TRUSTED_EMOTE_CATALOG.filter(e=>e.premium).length,6);
assert.equal(emotes.userCanUseEmote({},'emote_001'),true);
assert.equal(emotes.userCanUseEmote({},'emote_007'),false);
assert.equal(emotes.userCanUseEmote({cosmetics:{emotes:['emote_007']}},'emote_007'),true);
console.log('MULTIPLAYER_SOCIAL_23_21_3_UNIT_OK chat=220 ring=40 chatRate=5/15s emoteRate=3/20s emotes=12 free=6 premium=6');
