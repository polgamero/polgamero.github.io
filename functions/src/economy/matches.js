// v23.19.5.4 — Match Settlement + Anti-Farming server authority.
import { FieldValue } from 'firebase-admin/firestore';
import { economyError } from '../shared/errors.js';
import {
  normalizeMatchRewardConfig, deriveTerminalOutcome, normalizeMatchCampaignEffects,
  effectiveMatchRewardPoints, argentinaMatchDayKey, pvpPairKey, pvpCompletedTurns,
  evaluatePvpRewardEligibility
} from './matchCore.js';

let campaignCache={at:0,events:[]};
const CAMPAIGN_TTL_MS=15_000;
const timestampMs=value=>value?.toMillis?.()??(value instanceof Date?value.getTime():(Number(value)||0));

export function normalizeGameRewardReceiptId(value){return String(value||'').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,240);}
export function normalizeMatchRewardRequest(data={}){
  const receiptId=normalizeGameRewardReceiptId(data.receiptId);
  const mode=data.mode==='multiplayer'?'multiplayer':'solo';
  const outcome=data.outcome==='loss'?'loss':'win';
  const difficulty=mode==='solo'&&['easy','medium','hard'].includes(String(data.difficulty||'').toLowerCase())?String(data.difficulty).toLowerCase():null;
  const matchId=mode==='multiplayer'?String(data.matchId||'').trim().toUpperCase():'';
  if(!receiptId||receiptId.length<8) throw economyError('MATCH_REWARD_INVALID');
  if(mode==='solo'&&!difficulty) throw economyError('MATCH_REWARD_DIFFICULTY_REQUIRED');
  if(mode==='multiplayer'&&!matchId) throw economyError('MATCH_REWARD_MATCH_REQUIRED');
  return {receiptId,mode,outcome,difficulty,matchId};
}
export async function loadMatchCampaignEffects(db,nowMs=Date.now()){
  if(nowMs-campaignCache.at>=CAMPAIGN_TTL_MS){
    try{
      const snap=await db.collection('campaignEvents').where('startAt','<=',new Date(nowMs)).orderBy('startAt','desc').limit(20).get();
      campaignCache={at:nowMs,events:snap.docs.map(doc=>({id:doc.id,...(doc.data()||{})}))};
    }catch{campaignCache={at:0,events:[]};throw economyError('CAMPAIGN_POLICY_UNAVAILABLE');}
  }
  return normalizeMatchCampaignEffects(campaignCache.events,nowMs);
}

export async function sealMultiplayerOutcomeServer(db,uid,matchId){
  const id=String(matchId||'').trim().toUpperCase(); if(!id) throw economyError('MATCH_REWARD_MATCH_REQUIRED');
  const ref=db.collection('matches').doc(id);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref); if(!snap.exists) throw economyError('PVP_MATCH_NOT_FOUND');
    const data=snap.data()||{};
    const myRole=data.hostUid===uid?'host':(data.guestUid===uid?'guest':null); if(!myRole) throw economyError('PVP_NOT_MATCH_PARTICIPANT');
    if(data.endedAt&&data.terminalKind&&data.winnerRole) return {terminalKind:data.terminalKind,winnerRole:data.winnerRole,turnCountAtEnd:Number(data.turnCountAtEnd||data.turnCount||1)};
    const terminal=deriveTerminalOutcome(data);
    if(!data.gameOver||!terminal) throw economyError('PVP_MATCH_NOT_TERMINAL');
    if(!data.bothReadyAt&&!(data.hostReady===true&&data.guestReady===true)) throw economyError('PVP_MATCH_NOT_READY');
    const patch={terminalKind:terminal.terminalKind,winnerRole:terminal.winnerRole,turnCountAtEnd:Math.max(1,Math.floor(Number(data.turnCount)||1)),endedAt:FieldValue.serverTimestamp()};
    if(!data.bothReadyAt) patch.bothReadyAt=FieldValue.serverTimestamp();
    tx.update(ref,patch); return {...terminal,turnCountAtEnd:patch.turnCountAtEnd};
  });
}

export async function settleMatchRewardTx({db,tx,uid,request,campaignEffects}){
  const reward=normalizeMatchRewardRequest(request);
  const userRef=db.collection('users').doc(uid), receiptRef=db.collection('gameRewardReceipts').doc(`${uid}_${reward.receiptId}`), settingsRef=db.doc('gameConfig/settings');
  if(reward.mode==='solo'){
    const [receiptSnap,userSnap,settingsSnap]=await Promise.all([tx.get(receiptRef),tx.get(userRef),tx.get(settingsRef)]);
    if(!userSnap.exists) throw economyError('PROFILE_MISSING');
    const current=Math.max(0,Math.floor(Number(userSnap.data()?.points)||0));
    if(receiptSnap.exists){const p=receiptSnap.data()||{};return {duplicate:true,total:current,appliedDelta:Number(p.effectiveDelta)||0,effectiveDelta:Number(p.effectiveDelta)||0,rewardReason:p.rewardReason||'duplicate',receiptId:reward.receiptId,mode:'solo',outcome:p.outcome||reward.outcome,difficulty:p.difficulty||reward.difficulty};}
    const config=normalizeMatchRewardConfig(settingsSnap.exists?settingsSnap.data():{});
    const baseDelta=reward.outcome==='loss'?config.solo.loss:config.solo[reward.difficulty];
    const effectiveDelta=effectiveMatchRewardPoints(baseDelta,campaignEffects), next=current+effectiveDelta;
    tx.update(userRef,{points:next});
    tx.create(receiptRef,{uid,receiptId:reward.receiptId,mode:'solo',outcome:reward.outcome,difficulty:reward.difficulty,baseDelta,effectiveDelta,resultingTotal:next,rewardReason:'rewarded',campaign:campaignEffects,authority:'server',createdAt:FieldValue.serverTimestamp()});
    return {duplicate:false,total:next,appliedDelta:effectiveDelta,effectiveDelta,rewardReason:'rewarded',baseDelta,receiptId:reward.receiptId,mode:'solo',outcome:reward.outcome,difficulty:reward.difficulty,campaign:campaignEffects};
  }

  const matchRef=db.collection('matches').doc(reward.matchId);
  const [receiptSnap,userSnap,matchSnap,settingsSnap]=await Promise.all([tx.get(receiptRef),tx.get(userRef),tx.get(matchRef),tx.get(settingsRef)]);
  if(!userSnap.exists) throw economyError('PROFILE_MISSING'); if(!matchSnap.exists) throw economyError('PVP_MATCH_NOT_FOUND');
  const current=Math.max(0,Math.floor(Number(userSnap.data()?.points)||0));
  if(receiptSnap.exists){const p=receiptSnap.data()||{};return {duplicate:true,total:current,appliedDelta:Number(p.effectiveDelta)||0,effectiveDelta:Number(p.effectiveDelta)||0,requestedEffectiveDelta:Number(p.requestedEffectiveDelta)||0,rewardReason:p.rewardReason||'duplicate',terminalKind:p.terminalKind||null,durationMs:Number(p.durationMs)||0,completedTurns:Number(p.completedTurns)||0,pvpDayKey:p.pvpDayKey||null,pairCountAfter:Number(p.pairCountAfter)||0,dailyPointsAfter:Number(p.dailyPointsAfter)||0,limits:p.limits||null,receiptId:reward.receiptId,mode:'multiplayer',outcome:p.outcome||reward.outcome,matchId:reward.matchId};}
  const match=matchSnap.data()||{}; if(!match.endedAt||!match.terminalKind||!match.winnerRole) throw economyError('PVP_MATCH_NOT_SEALED');
  const myRole=match.hostUid===uid?'host':(match.guestUid===uid?'guest':null); if(!myRole) throw economyError('PVP_NOT_MATCH_PARTICIPANT');
  const terminal=deriveTerminalOutcome(match); if(!terminal||terminal.terminalKind!==match.terminalKind||terminal.winnerRole!==match.winnerRole) throw economyError('PVP_TERMINAL_EVIDENCE_MISMATCH');
  const actualOutcome=match.winnerRole===myRole?'win':'loss'; if(actualOutcome!==reward.outcome) throw economyError('PVP_OUTCOME_MISMATCH');
  const config=normalizeMatchRewardConfig(settingsSnap.exists?settingsSnap.data():{}), baseDelta=config.pvp[actualOutcome], requestedEffectiveDelta=effectiveMatchRewardPoints(baseDelta,campaignEffects);
  const endedAtMs=timestampMs(match.endedAt), bothReadyAtMs=timestampMs(match.bothReadyAt), durationMs=bothReadyAtMs>0&&endedAtMs>=bothReadyAtMs?endedAtMs-bothReadyAtMs:0;
  const turnCountAtEnd=Math.max(1,Math.floor(Number(match.turnCountAtEnd||match.turnCount)||1)), completedTurns=pvpCompletedTurns(turnCountAtEnd), dayKey=argentinaMatchDayKey(endedAtMs||Date.now()), pairKey=pvpPairKey(match.hostUid,match.guestUid);
  const pairRef=db.collection('pvpDailyPairs').doc(`${dayKey}__${pairKey}`), dailyRef=db.collection('pvpDailyUsers').doc(`${dayKey}__${uid}`);
  const [pairSnap,dailySnap]=await Promise.all([tx.get(pairRef),tx.get(dailyRef)]), pairData=pairSnap.exists?(pairSnap.data()||{}):{}, dailyData=dailySnap.exists?(dailySnap.data()||{}):{};
  const ids=Array.isArray(pairData.rewardedMatchIds)?pairData.rewardedMatchIds:[], pairAlreadyRewarded=ids.includes(reward.matchId), pairRewardedCount=Math.max(0,Math.floor(Number(pairData.rewardedMatches)||ids.length)), dailyPointsAwarded=Math.max(0,Math.floor(Number(dailyData.pointsAwarded)||0));
  const verdict=evaluatePvpRewardEligibility({terminalKind:match.terminalKind,durationMs,turnCountAtEnd,pairAlreadyRewarded,pairRewardedCount,dailyPointsAwarded,requestedDelta:requestedEffectiveDelta,limits:config.limits});
  const passesEarlyGate=match.terminalKind!=='abandon'||(durationMs>=config.limits.minRewardMinutes*60000&&completedTurns>=config.limits.minCompletedTurns), pairCanCount=pairAlreadyRewarded||pairRewardedCount<config.limits.maxRewardedMatchesPerPairDaily, shouldRegister=passesEarlyGate&&pairCanCount&&!pairAlreadyRewarded;
  const pairCountAfter=pairRewardedCount+(shouldRegister?1:0), appliedDelta=Math.max(0,Math.floor(Number(verdict.appliedDelta)||0)), dailyPointsAfter=dailyPointsAwarded+appliedDelta, next=current+appliedDelta;
  if(shouldRegister) tx.set(pairRef,{schemaVersion:2,dayKey,uidA:[String(match.hostUid),String(match.guestUid)].sort()[0],uidB:[String(match.hostUid),String(match.guestUid)].sort()[1],rewardedMatches:pairCountAfter,rewardedMatchIds:ids.concat([reward.matchId]),updatedAt:FieldValue.serverTimestamp()},{merge:false});
  if(appliedDelta>0){tx.update(userRef,{points:next});const prior=Array.isArray(dailyData.rewardReceiptIds)?dailyData.rewardReceiptIds:[];tx.set(dailyRef,{schemaVersion:2,dayKey,uid,pointsAwarded:dailyPointsAfter,rewardReceiptIds:prior.includes(reward.receiptId)?prior:prior.concat([reward.receiptId]),updatedAt:FieldValue.serverTimestamp()},{merge:false});}
  tx.create(receiptRef,{uid,receiptId:reward.receiptId,mode:'multiplayer',outcome:actualOutcome,baseDelta,requestedEffectiveDelta,effectiveDelta:appliedDelta,resultingTotal:next,matchId:reward.matchId,terminalKind:match.terminalKind,rewardReason:verdict.reason,durationMs,completedTurns,pvpDayKey:dayKey,pairKey,pairCountAfter,dailyPointsAfter,limits:config.limits,campaign:campaignEffects,authority:'server',createdAt:FieldValue.serverTimestamp()});
  return {duplicate:false,total:next,appliedDelta,effectiveDelta:appliedDelta,requestedEffectiveDelta,rewardReason:verdict.reason,terminalKind:match.terminalKind,durationMs,completedTurns,pvpDayKey:dayKey,pairCountAfter,dailyPointsAfter,limits:config.limits,baseDelta,receiptId:reward.receiptId,mode:'multiplayer',outcome:actualOutcome,matchId:reward.matchId,campaign:campaignEffects};
}

export async function applyAbandonPenaltyTx({db,tx,uid,mode,matchId=''}){
  const userRef=db.collection('users').doc(uid), settingsRef=db.doc('gameConfig/settings');
  const refs=[tx.get(userRef),tx.get(settingsRef)]; let matchRef=null;
  if(mode==='multiplayer'){matchRef=db.collection('matches').doc(String(matchId||'').trim().toUpperCase());refs.push(tx.get(matchRef));}
  const snaps=await Promise.all(refs), userSnap=snaps[0], settingsSnap=snaps[1];
  if(!userSnap.exists) throw economyError('PROFILE_MISSING');
  if(mode==='multiplayer'){
    const matchSnap=snaps[2]; if(!matchSnap?.exists) throw economyError('PVP_MATCH_NOT_FOUND'); const match=matchSnap.data()||{}; const myRole=match.hostUid===uid?'host':(match.guestUid===uid?'guest':null);
    if(!myRole||match.abandonedBy!==myRole||match.gameOver!==true) throw economyError('PVP_ABANDON_EVIDENCE_MISMATCH');
  }
  const config=normalizeMatchRewardConfig(settingsSnap.exists?settingsSnap.data():{}), current=Math.max(0,Math.floor(Number(userSnap.data()?.points)||0)), next=Math.max(0,current+config.abandonPenalty), appliedDelta=next-current;
  tx.update(userRef,{points:next}); return {kind:'abandonPenalty',mode,matchId:mode==='multiplayer'?String(matchId||'').trim().toUpperCase():null,baseDelta:config.abandonPenalty,appliedDelta,total:next,authority:'server'};
}
