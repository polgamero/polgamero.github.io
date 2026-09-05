import crypto from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { economyError } from '../shared/errors.js';
import { ENGINE_VERSION, ECONOMY_SCHEMA_VERSION } from '../shared/constants.js';
import { dailyDateKey } from './dailyCore.js';
import { playerStatsMirrorServer } from './audit.js';
import {
  createTournamentBracket,
  normalizeTournamentPolicy,
  playerMatchForRound,
  sanitizedTournament,
  simulateNpcMatchesForRound,
  resolveMatchParticipants,
  TOURNAMENT_ROUNDS
} from './tournamentCore.js';

const ACTIVE='tournamentActive';
const RUNS='tournamentRuns';
const DAILY='tournamentDailyUsers';
const RECEIPTS='tournamentReceipts';

function nonneg(v){return Math.max(0,Math.floor(Number(v)||0));}
function inv(raw={}){return {standardPacks:nonneg(raw.standardPacks),guaranteedMythics:nonneg(raw.guaranteedMythics)};}
function safeUsername(profile={}){return String(profile.username||profile.displayName||'Jugador').trim().slice(0,40)||'Jugador';}

async function loadRun(db,uid,tx=null){
  const activeRef=db.collection(ACTIVE).doc(uid);
  const activeSnap=tx?await tx.get(activeRef):await activeRef.get();
  if(!activeSnap.exists)return {activeRef,runRef:null,run:null};
  const tournamentId=String(activeSnap.data()?.tournamentId||'');
  if(!tournamentId)return {activeRef,runRef:null,run:null};
  const runRef=db.collection(RUNS).doc(tournamentId);
  const runSnap=tx?await tx.get(runRef):await runRef.get();
  return {activeRef,runRef,run:runSnap.exists?{...runSnap.data(),tournamentId}:null};
}

export async function getTournamentState(db,{uid,resolveInterrupted=false}){
  if(!resolveInterrupted){
    const {run}=await loadRun(db,uid);
    return sanitizedTournament(run);
  }
  return db.runTransaction(async tx=>{
    const loaded=await loadRun(db,uid,tx);
    let run=loaded.run;
    if(!run)return null;
    if(run.status==='active'&&run.activeMatch){
      const statsRef=db.collection('playerStats').doc(uid);
      const userRef=db.collection('users').doc(uid);
      const [statsSnap,userSnap]=await Promise.all([tx.get(statsRef),tx.get(userRef)]);
      const profile=userSnap.exists?(userSnap.data()||{}):{};
      run={...run,status:'eliminated',eliminationReason:'interrupted_match',activeMatch:null};
      tx.set(loaded.runRef,{...run,updatedAt:FieldValue.serverTimestamp(),endedAt:FieldValue.serverTimestamp()},{merge:false});
      if(userSnap.exists){
        tx.set(statsRef,playerStatsMirrorServer(uid,profile,statsSnap.exists?(statsSnap.data()||{}):{}, {gamesPlayed:1,losses:1,tournamentMatches:1,tournamentLosses:1,tournamentForfeits:1}),{merge:false});
      }
      tx.create(db.collection('economyEvents').doc(`tournament_interrupt_${run.tournamentId}_${Date.now().toString(36)}`),{
        actorUid:uid,targetUid:uid,source:'tournament_interrupted_match_server',tournamentId:run.tournamentId,
        pointsDelta:0,fichasDelta:0,packsDelta:0,cardsDelta:0,authority:'server',immutable:true,
        engineVersion:ENGINE_VERSION,economySchemaVersion:ECONOMY_SCHEMA_VERSION,createdAt:FieldValue.serverTimestamp()
      });
    }
    return sanitizedTournament(run);
  });
}

export async function startTournamentTx({db,tx,uid,seed}){
  const activeRef=db.collection(ACTIVE).doc(uid);
  const activeSnap=await tx.get(activeRef);
  if(activeSnap.exists){
    const existingId=String(activeSnap.data()?.tournamentId||'');
    if(existingId){
      const existingRef=db.collection(RUNS).doc(existingId);
      const existing=await tx.get(existingRef);
      if(existing.exists&&existing.data()?.status==='active'){
        return {tournament:sanitizedTournament({...existing.data(),tournamentId:existingRef.id}),alreadyActive:true};
      }
    }
  }

  const userRef=db.collection('users').doc(uid);
  const userSnap=await tx.get(userRef);
  if(!userSnap.exists)throw economyError('PROFILE_MISSING');
  const username=safeUsername(userSnap.data()||{});
  const settingsSnap=await tx.get(db.doc('gameConfig/settings'));
  const policy=normalizeTournamentPolicy(settingsSnap.exists?(settingsSnap.data()||{}):{});
  const dayKey=dailyDateKey(new Date());
  const dailyRef=db.collection(DAILY).doc(`${dayKey}__${uid}`);
  const dailySnap=await tx.get(dailyRef);
  const daily=dailySnap.exists?(dailySnap.data()||{}):{};
  const used=nonneg(daily.rewardedStarts);
  const eligible=policy.rewardedStartsPerDay===0||used<policy.rewardedStartsPerDay;

  const tournamentId=`tour_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
  const statsRef=db.collection('playerStats').doc(uid);
  const statsSnap=await tx.get(statsRef);
  const run=createTournamentBracket({uid,username,tournamentId,seed,policy,rewardEligible:eligible,dayKey});
  const runRef=db.collection(RUNS).doc(tournamentId);
  tx.create(runRef,{...run,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),engineVersion:ENGINE_VERSION,economySchemaVersion:ECONOMY_SCHEMA_VERSION});
  tx.set(activeRef,{uid,tournamentId,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:false});
  tx.set(dailyRef,{uid,dayKey,rewardedStarts:eligible?used+1:used,totalStarts:nonneg(daily.totalStarts)+1,updatedAt:FieldValue.serverTimestamp()},{merge:false});
  tx.set(statsRef,playerStatsMirrorServer(uid,userSnap.data()||{},statsSnap.exists?(statsSnap.data()||{}):{}, {tournamentsPlayed:1}),{merge:false});
  return {tournament:sanitizedTournament(run),alreadyActive:false};
}

export async function beginTournamentMatchTx({db,tx,uid,tournamentId}){
  const loaded=await loadRun(db,uid,tx);
  const run=loaded.run;
  if(!run||run.tournamentId!==tournamentId)throw economyError('TOURNAMENT_NOT_FOUND');
  if(run.status!=='active')throw economyError('TOURNAMENT_NOT_ACTIVE');
  if(run.activeMatch)return {tournament:sanitizedTournament(run),match:run.activeMatch,replayed:true};
  const match=playerMatchForRound(run);
  if(!match)throw economyError('TOURNAMENT_BRACKET_INVALID');
  const {a,b}=resolveMatchParticipants(run,match);
  const opponentId=a==='player'?b:a;
  if(!opponentId||opponentId==='player')throw economyError('TOURNAMENT_BRACKET_INVALID');
  const opponent=run.entrants[opponentId];
  const roundKey=TOURNAMENT_ROUNDS[run.currentRoundIndex].key;
  const roundPolicy=run.policy[roundKey];
  const activeMatch={
    matchId:match.id,roundKey,roundIndex:run.currentRoundIndex,opponentId,
    opponent,difficulty:roundPolicy.difficulty,deckQuality:roundPolicy.deckQuality,startedAtMs:Date.now()
  };
  const next={...run,activeMatch};
  tx.set(loaded.runRef,{...next,updatedAt:FieldValue.serverTimestamp()},{merge:false});
  return {tournament:sanitizedTournament(next),match:activeMatch,replayed:false};
}

export async function settleTournamentMatchTx({db,tx,uid,tournamentId,matchId,won,forfeit=false}){
  const receiptRef=db.collection(RECEIPTS).doc(`${tournamentId}_${matchId}`);
  const prior=await tx.get(receiptRef);
  if(prior.exists){
    const data=prior.data()||{};
    if(data.uid!==uid||data.tournamentId!==tournamentId||data.matchId!==matchId||Boolean(data.won)!==Boolean(won)){
      throw economyError('TOURNAMENT_RECEIPT_CONFLICT');
    }
    return data.result||{};
  }

  const loaded=await loadRun(db,uid,tx);
  const run=loaded.run;
  if(!run||run.tournamentId!==tournamentId)throw economyError('TOURNAMENT_NOT_FOUND');
  if(run.status!=='active'||!run.activeMatch||run.activeMatch.matchId!==matchId)throw economyError('TOURNAMENT_MATCH_NOT_ACTIVE');
  const match=run.matches[matchId];
  const {a,b}=resolveMatchParticipants(run,match);
  const opponentId=a==='player'?b:a;
  const roundKey=run.activeMatch.roundKey;
  const policy=run.policy[roundKey];

  match.winnerEntrantId=won?'player':opponentId;
  match.status='completed';
  let pointsGain=0,packsGain=0,profileAfter=null;
  const userRef=db.collection('users').doc(uid);
  const statsRef=db.collection('playerStats').doc(uid);
  const [userSnap,statsSnap]=await Promise.all([tx.get(userRef),tx.get(statsRef)]);
  if(!userSnap.exists)throw economyError('PROFILE_MISSING');
  const profile=userSnap.data()||{};
  const statDeltas={gamesPlayed:1,tournamentMatches:1,...(won?{wins:1,tournamentWins:1}:{losses:1,tournamentLosses:1}),...(forfeit?{tournamentForfeits:1}:{})};

  if(won&&run.rewardEligible){
    pointsGain=nonneg(policy.points);
    packsGain=nonneg(policy.packs);
    const inventory=inv(profile.inventory);
    profileAfter={...profile,points:nonneg(profile.points)+pointsGain,inventory:{...inventory,standardPacks:inventory.standardPacks+packsGain}};
    tx.update(userRef,{points:profileAfter.points,inventory:profileAfter.inventory});
    statDeltas.pointsEarned=pointsGain;
    statDeltas.packsReceived=packsGain;
  } else profileAfter=profile;

  let status='active',currentRoundIndex=run.currentRoundIndex,championEntrantId=null;
  if(!won){
    status='eliminated';
  }else if(roundKey==='final'){
    status='champion';
    championEntrantId='player';
    statDeltas.tournamentChampionships=1;
  }else{
    if(roundKey==='round16')statDeltas.tournamentQuarterfinals=1;
    if(roundKey==='quarter')statDeltas.tournamentSemifinals=1;
    if(roundKey==='semi')statDeltas.tournamentFinals=1;
    currentRoundIndex+=1;
  }

  const next={
    ...run,status,currentRoundIndex,championEntrantId,activeMatch:null,
    eliminationReason:!won?(forfeit?'forfeit':'match_loss'):null,
    rewardsEarned:{points:nonneg(run.rewardsEarned?.points)+pointsGain,packs:nonneg(run.rewardsEarned?.packs)+packsGain}
  };
  if(status==='active')simulateNpcMatchesForRound(next,currentRoundIndex,`${tournamentId}|${matchId}`);
  tx.set(loaded.runRef,{...next,updatedAt:FieldValue.serverTimestamp(),...(status!=='active'?{endedAt:FieldValue.serverTimestamp()}:{})},{merge:false});
  // Keep tournamentActive pointing at the most recent run so the client can render the
  // champion/elimination summary after a reload. Starting a new run overwrites this pointer.
  tx.set(loaded.activeRef,{uid,tournamentId,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  tx.set(statsRef,playerStatsMirrorServer(uid,profileAfter,statsSnap.exists?(statsSnap.data()||{}):{},statDeltas),{merge:false});

  const result={
    tournament:sanitizedTournament(next),won:!!won,status,roundKey,pointsGain,packsGain,
    rewardEligible:!!run.rewardEligible,totalPoints:profileAfter.points,
    inventoryAfter:profileAfter.inventory||inv(profile.inventory),forfeit:!!forfeit
  };
  tx.create(receiptRef,{
    uid,tournamentId,matchId,roundKey,won:!!won,forfeit:!!forfeit,pointsGain,packsGain,
    rewardEligible:!!run.rewardEligible,result,authority:'server',immutable:true,createdAt:FieldValue.serverTimestamp()
  });
  tx.create(db.collection('economyEvents').doc(`tournament_${tournamentId}_${matchId}`),{
    actorUid:uid,targetUid:uid,source:forfeit?'tournament_forfeit_server':'tournament_round_server',
    tournamentId,matchId,roundKey,pointsDelta:pointsGain,fichasDelta:0,packsDelta:packsGain,cardsDelta:0,
    authority:'server',immutable:true,engineVersion:ENGINE_VERSION,economySchemaVersion:ECONOMY_SCHEMA_VERSION,
    createdAt:FieldValue.serverTimestamp()
  });
  return result;
}

export async function forfeitTournamentTx({db,tx,uid,tournamentId,matchId}){
  return settleTournamentMatchTx({db,tx,uid,tournamentId,matchId,won:false,forfeit:true});
}

export async function abandonTournamentTx({db,tx,uid,tournamentId}){
  const loaded=await loadRun(db,uid,tx);
  const run=loaded.run;
  if(!run||run.tournamentId!==tournamentId)throw economyError('TOURNAMENT_NOT_FOUND');
  if(run.status!=='active')throw economyError('TOURNAMENT_NOT_ACTIVE');
  // Between-match abandon is intentionally distinct from abandoning a live match. Once a
  // match has begun, the existing forfeit path settles that match as a loss.
  if(run.activeMatch)throw economyError('TOURNAMENT_MATCH_ACTIVE');

  const userRef=db.collection('users').doc(uid);
  const statsRef=db.collection('playerStats').doc(uid);
  const [userSnap,statsSnap]=await Promise.all([tx.get(userRef),tx.get(statsRef)]);
  if(!userSnap.exists)throw economyError('PROFILE_MISSING');
  const profile=userSnap.data()||{};
  const next={...run,status:'eliminated',eliminationReason:'tournament_abandon',activeMatch:null};
  tx.set(loaded.runRef,{...next,updatedAt:FieldValue.serverTimestamp(),endedAt:FieldValue.serverTimestamp()},{merge:false});
  tx.set(loaded.activeRef,{uid,tournamentId,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  tx.set(statsRef,playerStatsMirrorServer(uid,profile,statsSnap.exists?(statsSnap.data()||{}):{}, {tournamentForfeits:1}),{merge:false});
  tx.create(db.collection('economyEvents').doc(`tournament_abandon_${tournamentId}`),{
    actorUid:uid,targetUid:uid,source:'tournament_abandon_server',tournamentId,
    pointsDelta:0,fichasDelta:0,packsDelta:0,cardsDelta:0,authority:'server',immutable:true,
    engineVersion:ENGINE_VERSION,economySchemaVersion:ECONOMY_SCHEMA_VERSION,createdAt:FieldValue.serverTimestamp()
  });
  return {tournament:sanitizedTournament(next),abandoned:true,status:'eliminated',pointsGain:0,packsGain:0};
}
