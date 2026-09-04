// v23.19.5.4 — Match Settlement + Anti-Farming server authority.
import { FieldValue } from 'firebase-admin/firestore';
import { economyError } from '../shared/errors.js';
import { ENGINE_VERSION, ECONOMY_SCHEMA_VERSION } from '../shared/constants.js';
import { playerStatsMirrorServer } from './audit.js';
import {
  normalizeMatchRewardConfig, deriveTerminalOutcome, normalizeMatchCampaignEffects,
  effectiveMatchRewardPoints, argentinaMatchDayKey, pvpPairKey, pvpCompletedTurns,
  evaluatePvpRewardEligibility, normalizeAbandonDurationMs
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

function gameResultDeltas(mode,outcome,durationMs=0){
  const multi=mode==='multiplayer', won=outcome==='win';
  return {
    gamesPlayed:1, soloGames:multi?0:1, multiplayerGames:multi?1:0,
    wins:won?1:0, losses:won?0:1,
    soloWins:!multi&&won?1:0, soloLosses:!multi&&!won?1:0,
    multiplayerWins:multi&&won?1:0, multiplayerLosses:multi&&!won?1:0,
    totalDurationMs:normalizeAbandonDurationMs(durationMs)
  };
}
function writeGameResultEvidenceTx({tx,uid,profile,statsSnap,resultSnap,statsRef,resultRef,mode,outcome,durationMs}){
  if(resultSnap?.exists) return false;
  const safeDuration=normalizeAbandonDurationMs(durationMs);
  tx.set(statsRef,playerStatsMirrorServer(uid,profile,statsSnap?.exists?(statsSnap.data()||{}):{},gameResultDeltas(mode,outcome,safeDuration)),{merge:false});
  tx.create(resultRef,{
    uid,receiptId:resultRef.id.slice(`${uid}_`.length),mode,result:outcome,durationMs:safeDuration,
    abandoned:false,terminalKind:'natural',authority:'server',engineVersion:ENGINE_VERSION,
    economySchemaVersion:ECONOMY_SCHEMA_VERSION,createdAt:FieldValue.serverTimestamp()
  });
  return true;
}

// Replay/backfill safety for rolling 23.19.5.4 -> 23.19.5.5. A pre-schema-6 operation
// ledger can already be committed, so runIdempotentOperation may skip the new transaction.
// This second idempotent transaction fills ONLY missing result/stats evidence; it never
// mutates the reward balance and therefore cannot double-pay a match.
export async function ensureMatchResultStats({db,uid,request,result={},clientDurationMs=0}){
  const reward=normalizeMatchRewardRequest(request);
  const userRef=db.collection('users').doc(uid),statsRef=db.collection('playerStats').doc(uid),resultRef=db.collection('playerGameReceipts').doc(`${uid}_${reward.receiptId}`);
  const matchRef=reward.mode==='multiplayer'?db.collection('matches').doc(reward.matchId):null;
  return db.runTransaction(async tx=>{
    const reads=[tx.get(userRef),tx.get(statsRef),tx.get(resultRef)]; if(matchRef) reads.push(tx.get(matchRef));
    const snaps=await Promise.all(reads),userSnap=snaps[0],statsSnap=snaps[1],resultSnap=snaps[2],matchSnap=matchRef?snaps[3]:null;
    if(!userSnap.exists) throw economyError('PROFILE_MISSING');
    if(resultSnap.exists) return {applied:false,reason:'duplicate_result_receipt'};
    let actualOutcome=reward.outcome, durationMs=normalizeAbandonDurationMs(clientDurationMs);
    if(reward.mode==='multiplayer'){
      if(!matchSnap?.exists) throw economyError('PVP_MATCH_NOT_FOUND');
      const match=matchSnap.data()||{},myRole=match.hostUid===uid?'host':(match.guestUid===uid?'guest':null);
      if(!myRole||!match.endedAt||!match.winnerRole||!match.terminalKind) throw economyError('PVP_MATCH_NOT_SEALED');
      actualOutcome=match.winnerRole===myRole?'win':'loss';
      const endedAtMs=timestampMs(match.endedAt),bothReadyAtMs=timestampMs(match.bothReadyAt);
      durationMs=bothReadyAtMs>0&&endedAtMs>=bothReadyAtMs?endedAtMs-bothReadyAtMs:normalizeAbandonDurationMs(result?.durationMs);
    }
    const profile=userSnap.data()||{};
    writeGameResultEvidenceTx({tx,uid,profile,statsSnap,resultSnap,statsRef,resultRef,mode:reward.mode,outcome:actualOutcome,durationMs});
    return {applied:true,receiptId:reward.receiptId,mode:reward.mode,outcome:actualOutcome,durationMs};
  });
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

export async function settleMatchRewardTx({db,tx,uid,request,campaignEffects,clientDurationMs=0}){
  const reward=normalizeMatchRewardRequest(request);
  const userRef=db.collection('users').doc(uid), receiptRef=db.collection('gameRewardReceipts').doc(`${uid}_${reward.receiptId}`), settingsRef=db.doc('gameConfig/settings');
  if(reward.mode==='solo'){
    const statsRef=db.collection('playerStats').doc(uid),resultRef=db.collection('playerGameReceipts').doc(`${uid}_${reward.receiptId}`);
    const [receiptSnap,userSnap,settingsSnap,statsSnap,resultSnap]=await Promise.all([tx.get(receiptRef),tx.get(userRef),tx.get(settingsRef),tx.get(statsRef),tx.get(resultRef)]);
    if(!userSnap.exists) throw economyError('PROFILE_MISSING');
    const profile=userSnap.data()||{},current=Math.max(0,Math.floor(Number(profile.points)||0)),safeDuration=normalizeAbandonDurationMs(clientDurationMs);
    if(receiptSnap.exists){
      const prior=receiptSnap.data()||{},actualOutcome=prior.outcome||reward.outcome;
      writeGameResultEvidenceTx({tx,uid,profile,statsSnap,resultSnap,statsRef,resultRef,mode:'solo',outcome:actualOutcome,durationMs:safeDuration});
      return {duplicate:true,total:current,appliedDelta:Number(prior.effectiveDelta)||0,effectiveDelta:Number(prior.effectiveDelta)||0,rewardReason:prior.rewardReason||'duplicate',terminalKind:prior.terminalKind||null,abandoned:prior.abandoned===true,penalty:prior.penalty===true,receiptId:reward.receiptId,mode:'solo',outcome:actualOutcome,difficulty:prior.difficulty||reward.difficulty};
    }
    const config=normalizeMatchRewardConfig(settingsSnap.exists?settingsSnap.data():{});
    const baseDelta=reward.outcome==='loss'?config.solo.loss:config.solo[reward.difficulty];
    const effectiveDelta=effectiveMatchRewardPoints(baseDelta,campaignEffects), next=current+effectiveDelta,profileAfter={...profile,points:next};
    tx.update(userRef,{points:next});
    writeGameResultEvidenceTx({tx,uid,profile:profileAfter,statsSnap,resultSnap,statsRef,resultRef,mode:'solo',outcome:reward.outcome,durationMs:safeDuration});
    tx.create(receiptRef,{uid,receiptId:reward.receiptId,mode:'solo',outcome:reward.outcome,difficulty:reward.difficulty,baseDelta,effectiveDelta,resultingTotal:next,rewardReason:'rewarded',campaign:campaignEffects,authority:'server',createdAt:FieldValue.serverTimestamp()});
    return {duplicate:false,total:next,appliedDelta:effectiveDelta,effectiveDelta,rewardReason:'rewarded',baseDelta,receiptId:reward.receiptId,mode:'solo',outcome:reward.outcome,difficulty:reward.difficulty,campaign:campaignEffects};
  }

  const matchRef=db.collection('matches').doc(reward.matchId),statsRef=db.collection('playerStats').doc(uid),resultRef=db.collection('playerGameReceipts').doc(`${uid}_${reward.receiptId}`);
  const [receiptSnap,userSnap,matchSnap,settingsSnap,statsSnap,resultSnap]=await Promise.all([tx.get(receiptRef),tx.get(userRef),tx.get(matchRef),tx.get(settingsRef),tx.get(statsRef),tx.get(resultRef)]);
  if(!userSnap.exists) throw economyError('PROFILE_MISSING'); if(!matchSnap.exists) throw economyError('PVP_MATCH_NOT_FOUND');
  const profile=userSnap.data()||{},current=Math.max(0,Math.floor(Number(profile.points)||0));
  if(receiptSnap.exists){
    const prior=receiptSnap.data()||{},actualOutcome=prior.outcome||reward.outcome,safeDuration=normalizeAbandonDurationMs(prior.durationMs);
    writeGameResultEvidenceTx({tx,uid,profile,statsSnap,resultSnap,statsRef,resultRef,mode:'multiplayer',outcome:actualOutcome,durationMs:safeDuration});
    return {duplicate:true,total:current,appliedDelta:Number(prior.effectiveDelta)||0,effectiveDelta:Number(prior.effectiveDelta)||0,requestedEffectiveDelta:Number(prior.requestedEffectiveDelta)||0,rewardReason:prior.rewardReason||'duplicate',terminalKind:prior.terminalKind||null,durationMs:safeDuration,completedTurns:Number(prior.completedTurns)||0,pvpDayKey:prior.pvpDayKey||null,pairCountAfter:Number(prior.pairCountAfter)||0,dailyPointsAfter:Number(prior.dailyPointsAfter)||0,limits:prior.limits||null,receiptId:reward.receiptId,mode:'multiplayer',outcome:actualOutcome,matchId:reward.matchId};
  }
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
  writeGameResultEvidenceTx({tx,uid,profile:{...profile,points:next},statsSnap,resultSnap,statsRef,resultRef,mode:'multiplayer',outcome:actualOutcome,durationMs});
  tx.create(receiptRef,{uid,receiptId:reward.receiptId,mode:'multiplayer',outcome:actualOutcome,baseDelta,requestedEffectiveDelta,effectiveDelta:appliedDelta,resultingTotal:next,matchId:reward.matchId,terminalKind:match.terminalKind,rewardReason:verdict.reason,durationMs,completedTurns,pvpDayKey:dayKey,pairKey,pairCountAfter,dailyPointsAfter,limits:config.limits,campaign:campaignEffects,authority:'server',createdAt:FieldValue.serverTimestamp()});
  return {duplicate:false,total:next,appliedDelta,effectiveDelta:appliedDelta,requestedEffectiveDelta,rewardReason:verdict.reason,terminalKind:match.terminalKind,durationMs,completedTurns,pvpDayKey:dayKey,pairCountAfter,dailyPointsAfter,limits:config.limits,baseDelta,receiptId:reward.receiptId,mode:'multiplayer',outcome:actualOutcome,matchId:reward.matchId,campaign:campaignEffects};
}

function abandonSafeId(value){return String(value||'').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,420);}
function abandonGameDeltas(mode,durationMs){
  const multi=mode==='multiplayer';
  return {
    gamesPlayed:1,soloGames:multi?0:1,multiplayerGames:multi?1:0,
    losses:1,soloLosses:multi?0:1,multiplayerLosses:multi?1:0,
    abandons:1,totalDurationMs:normalizeAbandonDurationMs(durationMs)
  };
}
function abandonReceiptIsCompatible(reward={}){
  return reward?.penalty===true||reward?.abandoned===true||reward?.terminalKind==='abandon'||reward?.rewardReason==='abandon_penalty';
}

async function synchronizeAbandonSettlementTx({db,tx,uid,mode,matchId='',receiptId='',durationMs=0,operationId='',applyPenalty=true,authoritativeResult=null}){
  const userRef=db.collection('users').doc(uid),settingsRef=db.doc('gameConfig/settings');
  const initial=[tx.get(userRef),tx.get(settingsRef)]; let matchRef=null;
  if(mode==='multiplayer'){
    matchRef=db.collection('matches').doc(String(matchId||'').trim().toUpperCase());
    initial.push(tx.get(matchRef));
  }
  const initialSnaps=await Promise.all(initial),userSnap=initialSnaps[0],settingsSnap=initialSnaps[1];
  if(!userSnap.exists) throw economyError('PROFILE_MISSING');

  let myRole=null;
  if(mode==='multiplayer'){
    const matchSnap=initialSnaps[2];
    if(!matchSnap?.exists) throw economyError('PVP_MATCH_NOT_FOUND');
    const match=matchSnap.data()||{};
    myRole=match.hostUid===uid?'host':(match.guestUid===uid?'guest':null);
    if(!myRole||match.abandonedBy!==myRole||match.gameOver!==true) throw economyError('PVP_ABANDON_EVIDENCE_MISMATCH');
  }

  const normalizedReceipt=mode==='solo'
    ? normalizeGameRewardReceiptId(receiptId)
    : normalizeGameRewardReceiptId(`match_${String(matchId||'').trim().toUpperCase()}_${myRole}`);
  if(!normalizedReceipt) throw economyError('ABANDON_RECEIPT_REQUIRED');

  const statsRef=db.collection('playerStats').doc(uid);
  const resultRef=db.collection('playerGameReceipts').doc(`${uid}_${normalizedReceipt}`);
  const rewardRef=mode==='solo'?db.collection('gameRewardReceipts').doc(`${uid}_${normalizedReceipt}`):null;
  const eventRef=db.collection('economyEvents').doc(abandonSafeId(`${uid}_abandon_${normalizedReceipt}`));
  const extraReads=[tx.get(statsRef),tx.get(resultRef),tx.get(eventRef)];
  if(rewardRef) extraReads.push(tx.get(rewardRef));
  const extras=await Promise.all(extraReads),statsSnap=extras[0],resultSnap=extras[1],eventSnap=extras[2],rewardSnap=rewardRef?extras[3]:null;
  const priorReward=rewardSnap?.exists?(rewardSnap.data()||{}):null;
  if(priorReward&&!abandonReceiptIsCompatible(priorReward)) throw economyError('ABANDON_RECEIPT_CONFLICT',{receiptId:normalizedReceipt});

  const profile=userSnap.data()||{},current=Math.max(0,Math.floor(Number(profile.points)||0));
  const config=normalizeMatchRewardConfig(settingsSnap.exists?settingsSnap.data():{});
  let baseDelta=Number(authoritativeResult?.baseDelta);
  if(!Number.isFinite(baseDelta)) baseDelta=config.abandonPenalty;
  baseDelta=Math.floor(baseDelta);
  let appliedDelta=Number(authoritativeResult?.appliedDelta);
  let next=Number(authoritativeResult?.total);

  if(priorReward){
    appliedDelta=Math.floor(Number(priorReward.effectiveDelta)||0);
    baseDelta=Math.floor(Number(priorReward.baseDelta)||baseDelta);
    next=current;
  } else if(applyPenalty){
    next=Math.max(0,current+config.abandonPenalty);
    appliedDelta=next-current;
    baseDelta=config.abandonPenalty;
    if(appliedDelta!==0) tx.update(userRef,{points:next});
  } else {
    appliedDelta=Number.isFinite(appliedDelta)?Math.floor(appliedDelta):0;
    next=Number.isFinite(next)?Math.max(0,Math.floor(next)):current;
  }

  const existingResult=resultSnap.exists?(resultSnap.data()||{}):{};
  const safeDuration=normalizeAbandonDurationMs(durationMs||existingResult.durationMs||0);
  const statDeltas={};
  if(!resultSnap.exists) Object.assign(statDeltas,abandonGameDeltas(mode,safeDuration));
  if(!eventSnap.exists&&appliedDelta<0) statDeltas.pointsLost=Math.abs(appliedDelta);
  const profileAfter={...profile,points:priorReward||!applyPenalty?current:next};
  tx.set(statsRef,playerStatsMirrorServer(uid,profileAfter,statsSnap.exists?(statsSnap.data()||{}):{},statDeltas),{merge:false});
  tx.set(resultRef,{
    uid,receiptId:normalizedReceipt,mode,result:'loss',abandoned:true,terminalKind:'abandon',
    endReason:'abandon_local',durationMs:safeDuration,authority:'server',engineVersion:ENGINE_VERSION,
    economySchemaVersion:ECONOMY_SCHEMA_VERSION,updatedAt:FieldValue.serverTimestamp(),
    ...(resultSnap.exists?{}:{createdAt:FieldValue.serverTimestamp()})
  },{merge:true});

  if(rewardRef&&!priorReward){
    tx.create(rewardRef,{
      uid,receiptId:normalizedReceipt,mode:'solo',outcome:'loss',difficulty:null,
      baseDelta,effectiveDelta:appliedDelta,resultingTotal:next,rewardReason:'abandon_penalty',
      terminalKind:'abandon',abandoned:true,penalty:true,authority:'server',operationId,
      durationMs:safeDuration,engineVersion:ENGINE_VERSION,economySchemaVersion:ECONOMY_SCHEMA_VERSION,
      createdAt:FieldValue.serverTimestamp()
    });
  }
  if(!eventSnap.exists){
    tx.create(eventRef,{
      actorUid:uid,targetUid:uid,source:'abandon_penalty_server',operationId,type:'match.abandon_penalty',
      pointsDelta:appliedDelta,fichasDelta:0,packsDelta:0,cardsDelta:0,
      metadata:{mode,matchId:mode==='multiplayer'?String(matchId||'').trim().toUpperCase():null,receiptId:normalizedReceipt,terminalKind:'abandon'},
      authority:'server',immutable:true,engineVersion:ENGINE_VERSION,economySchemaVersion:ECONOMY_SCHEMA_VERSION,
      createdAt:FieldValue.serverTimestamp()
    });
  }
  return {
    kind:'abandonPenalty',mode,matchId:mode==='multiplayer'?String(matchId||'').trim().toUpperCase():null,
    receiptId:normalizedReceipt,baseDelta,appliedDelta,total:priorReward?current:next,
    rewardReason:'abandon_penalty',terminalKind:'abandon',abandoned:true,penalty:true,authority:'server',
    duplicate:!!priorReward
  };
}

export async function applyAbandonPenaltyTx(args){
  return synchronizeAbandonSettlementTx({...args,applyPenalty:true});
}

// Rollout/backfill guard: a 23.19.5.4 client may replay an operation ledger entry created
// before schema 6. The points mutation is already committed in that case, so this path only
// creates the signed terminal receipts/stats/audit evidence and NEVER applies the penalty twice.
export async function ensureAbandonSettlementEvidence(db,{uid,operationId,mode,matchId='',receiptId='',durationMs=0,result=null}){
  return db.runTransaction(tx=>synchronizeAbandonSettlementTx({
    db,tx,uid,operationId,mode,matchId,receiptId,durationMs,applyPenalty:false,authoritativeResult:result||{}
  }));
}
