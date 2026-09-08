import { FieldValue } from 'firebase-admin/firestore';
import { ENGINE_VERSION, ECONOMY_SCHEMA_VERSION } from '../shared/constants.js';
import { calculateEloChange, ELO_MAX_RATED_PAIR_DAILY, normalizeEloStats } from './eloCore.js';

const safePair=(a,b)=>[String(a||''),String(b||'')].sort().join('__');
const safeDay=v=>String(v||'').replace(/[^0-9-]/g,'').slice(0,10);

export async function loadPvpEloContext({db,tx,match,matchId,dayKey}){
  const hostUid=String(match?.hostUid||''),guestUid=String(match?.guestUid||'');
  if(!hostUid||!guestUid||!matchId)return null;
  const receiptRef=db.collection('pvpEloReceipts').doc(String(matchId));
  const pairKey=safePair(hostUid,guestUid),pairRef=db.collection('pvpEloDailyPairs').doc(`${safeDay(dayKey)}__${pairKey}`);
  const hostStatsRef=db.collection('playerStats').doc(hostUid),guestStatsRef=db.collection('playerStats').doc(guestUid);
  const [receiptSnap,pairSnap,hostStatsSnap,guestStatsSnap]=await Promise.all([tx.get(receiptRef),tx.get(pairRef),tx.get(hostStatsRef),tx.get(guestStatsRef)]);
  return {hostUid,guestUid,receiptRef,pairRef,pairKey,receiptSnap,pairSnap,hostStatsRef,guestStatsRef,hostStatsSnap,guestStatsSnap,dayKey:safeDay(dayKey)};
}

export function commitPvpEloSettlementTx({tx,context,match,matchId}){
  if(!context)return {rated:false,reason:'missing_context'};
  if(context.receiptSnap.exists){const prior=context.receiptSnap.data()||{};return {rated:prior.rated===true,reason:prior.reason||'duplicate',duplicate:true};}
  const pair=context.pairSnap.exists?(context.pairSnap.data()||{}):{},ids=Array.isArray(pair.matchIds)?pair.matchIds:[],count=Math.max(0,Math.floor(Number(pair.ratedMatches)||ids.length));
  const hostWon=String(match?.winnerRole||'')==='host';
  const base={matchId:String(matchId),hostUid:context.hostUid,guestUid:context.guestUid,winnerUid:hostWon?context.hostUid:context.guestUid,dayKey:context.dayKey,pairKey:context.pairKey,authority:'server',immutable:true,engineVersion:ENGINE_VERSION,economySchemaVersion:ECONOMY_SCHEMA_VERSION,createdAt:FieldValue.serverTimestamp()};
  if(count>=ELO_MAX_RATED_PAIR_DAILY){
    tx.create(context.receiptRef,{...base,rated:false,reason:'pair_daily_cap',pairCountAfter:count});
    return {rated:false,reason:'pair_daily_cap',pairCountAfter:count};
  }
  const hostBefore=normalizeEloStats(context.hostStatsSnap.exists?(context.hostStatsSnap.data()||{}):{}),guestBefore=normalizeEloStats(context.guestStatsSnap.exists?(context.guestStatsSnap.data()||{}):{}),change=calculateEloChange(hostBefore,guestBefore,hostWon?1:0);
  const hostAfter={eloRating:change.a.after,eloPeak:Math.max(hostBefore.peak,change.a.after),eloGames:hostBefore.games+1,eloWins:hostBefore.wins+(hostWon?1:0),eloLosses:hostBefore.losses+(hostWon?0:1)};
  const guestAfter={eloRating:change.b.after,eloPeak:Math.max(guestBefore.peak,change.b.after),eloGames:guestBefore.games+1,eloWins:guestBefore.wins+(hostWon?0:1),eloLosses:guestBefore.losses+(hostWon?1:0)};
  tx.set(context.hostStatsRef,hostAfter,{merge:true});
  tx.set(context.guestStatsRef,guestAfter,{merge:true});
  const nextIds=ids.includes(String(matchId))?ids:ids.concat([String(matchId)]),pairCountAfter=count+1;
  tx.set(context.pairRef,{dayKey:context.dayKey,uidA:[context.hostUid,context.guestUid].sort()[0],uidB:[context.hostUid,context.guestUid].sort()[1],ratedMatches:pairCountAfter,matchIds:nextIds,updatedAt:FieldValue.serverTimestamp()},{merge:false});
  tx.create(context.receiptRef,{...base,rated:true,reason:'rated',pairCountAfter,host:{...change.a,...hostAfter},guest:{...change.b,...guestAfter}});
  return {rated:true,reason:'rated',pairCountAfter,host:{...change.a,...hostAfter},guest:{...change.b,...guestAfter}};
}
