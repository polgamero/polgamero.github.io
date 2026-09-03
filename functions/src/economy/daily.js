// v23.19.5.3 — Daily Rewards server authority.
import { FieldValue } from 'firebase-admin/firestore';
import { economyError } from '../shared/errors.js';
import {
  DAILY_REWARDS_SCHEMA_VERSION,
  DAILY_REWARD_SCHEDULE,
  normalizeDailyState,
  advanceDailyState,
  dailyDateKey,
  dailyRewardForDay,
  dailyRewardClaimable,
  serializeDailyState,
  buildDailyCampaignEffects,
  effectiveDailyRewards,
  dailyRewardTotals
} from './dailyCore.js';

export { DAILY_REWARDS_SCHEMA_VERSION, DAILY_REWARD_SCHEDULE, buildDailyCampaignEffects, effectiveDailyRewards } from './dailyCore.js';

let campaignCache={at:0,events:[]};
const CAMPAIGN_TTL_MS=15_000;

function clampDebug(value){ return Math.max(0,Math.min(30,Math.floor(Number(value)||0))); }
function normalizeInventory(raw){
  const x=raw&&typeof raw==='object'?raw:{};
  return {standardPacks:Math.max(0,Math.floor(Number(x.standardPacks)||0)),guaranteedMythics:Math.max(0,Math.floor(Number(x.guaranteedMythics)||0))};
}
function effectiveClock(profile,serverNowMs,isAdmin){
  const debugOffsetDays=isAdmin?clampDebug(profile?.rewardDebugOffsetDays):0;
  return {serverNowMs,effectiveNow:new Date(serverNowMs+debugOffsetDays*86_400_000),debugOffsetDays};
}
function loginResult(plan,clock){
  return {
    newCalendarLogin:!!plan.newCalendarLogin,
    rewardDay:plan.rewardDay==null?null:Number(plan.rewardDay),
    rewardUnlocked:!!plan.rewardUnlocked,
    streakReset:!!plan.streakReset,
    cycleRestarted:!!plan.cycleRestarted,
    cycleCompleted:!!plan.cycleCompleted,
    repairApplied:!!plan.repairApplied,
    streak:plan.state.streak,
    cycleStartDate:plan.state.cycleStartDate,
    authoritative:true,
    authority:'server',
    serverNowMs:clock.serverNowMs,
    effectiveNowMs:clock.effectiveNow.getTime(),
    debugOffsetDays:clock.debugOffsetDays,
    dailySchemaVersion:DAILY_REWARDS_SCHEMA_VERSION
  };
}
export async function loadDailyCampaignEffects(db,nowMs=Date.now()){
  if(nowMs-campaignCache.at>=CAMPAIGN_TTL_MS){
    try{
      const snap=await db.collection('campaignEvents').where('startAt','<=',new Date(nowMs)).orderBy('startAt','desc').limit(20).get();
      campaignCache={at:nowMs,events:snap.docs.map(doc=>({id:doc.id,...(doc.data()||{})}))};
    }catch(error){ campaignCache={at:0,events:[]}; throw economyError('CAMPAIGN_POLICY_UNAVAILABLE'); }
  }
  return buildDailyCampaignEffects(campaignCache.events,nowMs);
}
export async function registerDailyLoginTx({db,tx,uid,serverNowMs=Date.now(),isAdmin=false}){
  const userRef=db.collection('users').doc(uid);
  const snap=await tx.get(userRef);
  if(!snap.exists) throw economyError('PROFILE_MISSING');
  const profile=snap.data()||{};
  const clock=effectiveClock(profile,serverNowMs,isAdmin);
  const plan=advanceDailyState(profile.dailyRewards,clock.effectiveNow);
  const needsMigration=Math.max(0,Math.floor(Number(profile.dailyRewards?.schemaVersion)||0))<DAILY_REWARDS_SCHEMA_VERSION;
  const update={lastSeenAt:FieldValue.serverTimestamp()};
  if(plan.newCalendarLogin||needsMigration) update.dailyRewards=serializeDailyState(plan.state,new Date(serverNowMs));
  tx.update(userRef,update);
  return {kind:'dailyLogin',login:loginResult(plan,clock),dailyRewards:normalizeDailyState(plan.state)};
}
export async function claimDailyRewardTx({db,tx,uid,day,serverNowMs=Date.now(),isAdmin=false,campaignEffects}){
  const reward=dailyRewardForDay(day);
  if(!reward) throw economyError('DAILY_REWARD_INVALID');
  const userRef=db.collection('users').doc(uid);
  const snap=await tx.get(userRef);
  if(!snap.exists) throw economyError('PROFILE_MISSING');
  const profile=snap.data()||{};
  const clock=effectiveClock(profile,serverNowMs,isAdmin);
  const daily=normalizeDailyState(profile.dailyRewards);
  if(Number(profile.dailyRewards?.schemaVersion)<DAILY_REWARDS_SCHEMA_VERSION) throw economyError('DAILY_LOGIN_REQUIRED');
  if(daily.lastLoginDate!==dailyDateKey(clock.effectiveNow)) throw economyError('DAILY_LOGIN_REQUIRED');
  if(!dailyRewardClaimable(daily,day)) throw economyError('DAILY_REWARD_NOT_AVAILABLE');
  const rewards=effectiveDailyRewards(reward,campaignEffects);
  const totals=dailyRewardTotals(rewards);
  const inventory=normalizeInventory(profile.inventory);
  const pointsBefore=Math.max(0,Math.floor(Number(profile.points)||0));
  const fichasBefore=Math.max(0,Math.floor(Number(profile.fichas)||0));
  const nextDaily={...daily,claimedDays:[...new Set([...daily.claimedDays,Number(day)])].sort((a,b)=>a-b),lastClaimedDay:Number(day)};
  const nextInventory={standardPacks:inventory.standardPacks+totals.standardPacks,guaranteedMythics:inventory.guaranteedMythics+totals.guaranteedMythics};
  const pointsAfter=pointsBefore+totals.points, fichasAfter=fichasBefore+totals.fichas;
  tx.update(userRef,{
    points:pointsAfter,fichas:fichasAfter,inventory:nextInventory,
    dailyRewards:serializeDailyState(nextDaily,new Date(serverNowMs)),lastSeenAt:FieldValue.serverTimestamp()
  });
  return {
    kind:'dailyClaim',day:Number(day),rewards,pointsGain:totals.points,fichasGain:totals.fichas,
    standardPacksGain:totals.standardPacks,guaranteedMythicsGain:totals.guaranteedMythics,
    pointsAfter,fichasAfter,inventoryAfter:nextInventory,dailyRewards:nextDaily,
    campaign:{allPointsMultiplier:campaignEffects.allPointsMultiplier,allFichasMultiplier:campaignEffects.allFichasMultiplier,activeEventIds:campaignEffects.activeEventIds},
    authority:'server',dailySchemaVersion:DAILY_REWARDS_SCHEMA_VERSION
  };
}
export async function adminDailyDebugTx({db,tx,uid,mode,serverNowMs=Date.now()}){
  if(!['advance','reset'].includes(mode)) throw economyError('DAILY_DEBUG_MODE_INVALID');
  const userRef=db.collection('users').doc(uid);
  const snap=await tx.get(userRef);
  if(!snap.exists) throw economyError('PROFILE_MISSING');
  const profile=snap.data()||{};
  const current=clampDebug(profile.rewardDebugOffsetDays);
  if(mode==='advance'&&current>=30) throw economyError('DAILY_DEBUG_MAX');
  const nextOffset=mode==='reset'?0:current+1;
  const clock={serverNowMs,effectiveNow:new Date(serverNowMs+nextOffset*86_400_000),debugOffsetDays:nextOffset};
  const plan=advanceDailyState(profile.dailyRewards,clock.effectiveNow);
  const update={rewardDebugOffsetDays:nextOffset,lastSeenAt:FieldValue.serverTimestamp()};
  if(plan.newCalendarLogin||Number(profile.dailyRewards?.schemaVersion)<DAILY_REWARDS_SCHEMA_VERSION) update.dailyRewards=serializeDailyState(plan.state,new Date(serverNowMs));
  tx.update(userRef,update);
  return {kind:'dailyDebug',mode,rewardDebugOffsetDays:nextOffset,login:loginResult(plan,clock),dailyRewards:normalizeDailyState(plan.state)};
}
