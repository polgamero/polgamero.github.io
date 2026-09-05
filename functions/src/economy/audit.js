// v23.19.5.5 — server-owned economic statistics + immutable audit trail.
import { FieldValue } from 'firebase-admin/firestore';
import { ENGINE_VERSION, ECONOMY_SCHEMA_VERSION } from '../shared/constants.js';

const NUMERIC_KEYS = [
  'gamesPlayed','soloGames','multiplayerGames','wins','losses','soloWins','soloLosses',
  'multiplayerWins','multiplayerLosses','abandons','totalDurationMs','pointsEarned',
  'pointsSpent','pointsLost','fichasEarned','fichasSpent','packsReceived','packsOpened',
  'guaranteedMythicsOpened','tournamentsPlayed','tournamentMatches','tournamentWins','tournamentLosses',
  'tournamentQuarterfinals','tournamentSemifinals','tournamentFinals','tournamentChampionships','tournamentForfeits'
];

function int(value){ const n=Math.floor(Number(value)||0); return Number.isFinite(n)?n:0; }
function nonneg(value){ return Math.max(0,int(value)); }
function normalizeInventory(raw={}){
  return { standardPacks:nonneg(raw?.standardPacks), guaranteedMythics:nonneg(raw?.guaranteedMythics) };
}
export function normalizePlayerStatsServer(raw={}){
  const out={}; for(const key of NUMERIC_KEYS) out[key]=nonneg(raw?.[key]);
  out.gameBackfillVersion=nonneg(raw?.gameBackfillVersion);
  return out;
}
export function playerStatsMirrorServer(uid, profile={}, currentStats={}, deltas={}){
  const stats=normalizePlayerStatsServer(currentStats);
  for(const key of NUMERIC_KEYS){ const delta=int(deltas?.[key]); if(delta) stats[key]=Math.max(0,stats[key]+delta); }
  const collection=Array.isArray(profile.collection)?profile.collection:[];
  const inventory=normalizeInventory(profile.inventory);
  return {
    ...stats,
    uid:String(uid||''), username:String(profile.username||profile.displayName||'Jugador'),
    pointsCurrent:nonneg(profile.points), fichasCurrent:nonneg(profile.fichas),
    packsInChest:inventory.standardPacks, cardsOwned:collection.length,
    uniqueCards:new Set(collection.map(String)).size,
    authority:'server', economySchemaVersion:ECONOMY_SCHEMA_VERSION,
    updatedAt:FieldValue.serverTimestamp()
  };
}
function safeId(value){ return String(value||'').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,420); }

export function deriveAuthorityAudit(type,result={}){
  const out={ source:String(type||'unknown'), pointsDelta:0, fichasDelta:0, packsDelta:0, cardsDelta:0, stats:{} };
  switch(String(type||'')){
    case 'chest.open_pack':
      out.source='pack_open_server'; out.fichasDelta=nonneg(result.fichasGain); out.packsDelta=-1;
      out.cardsDelta=Array.isArray(result.cardIds)?result.cardIds.length:15;
      out.stats={fichasEarned:out.fichasDelta,packsOpened:1}; break;
    case 'chest.open_guaranteed_mythic':
      out.source='guaranteed_mythic_open_server'; out.cardsDelta=1; out.stats={guaranteedMythicsOpened:1}; break;
    case 'store.purchase_pack':
      out.source='pack_purchase_server'; out.pointsDelta=-nonneg(result.effectiveCost); out.packsDelta=1;
      out.stats={pointsSpent:nonneg(result.effectiveCost),packsReceived:1}; break;
    case 'store.craft_enhancement':
      out.source='enhancement_craft_server'; out.fichasDelta=-nonneg(result.fichasCost); out.stats={fichasSpent:nonneg(result.fichasCost)}; break;
    case 'store.purchase_prebuilt':
      out.source='prebuilt_deck_purchase_server'; out.pointsDelta=-nonneg(result.pointsCost); out.fichasDelta=-nonneg(result.fichasCost); out.cardsDelta=nonneg(result.cardsGranted);
      out.stats={pointsSpent:nonneg(result.pointsCost),fichasSpent:nonneg(result.fichasCost)}; break;
    case 'store.purchase_classified':
      out.source='classified_purchase_server'; out.pointsDelta=-nonneg(result.pointsCost); out.fichasDelta=-nonneg(result.fichasCost); out.cardsDelta=1;
      out.stats={pointsSpent:nonneg(result.pointsCost),fichasSpent:nonneg(result.fichasCost)}; break;
    case 'account.rename_username':
      out.source='username_rename_server'; out.fichasDelta=-nonneg(result.fichasCost); out.stats={fichasSpent:nonneg(result.fichasCost)}; break;
    case 'daily.claim':
      out.source='daily_reward_server'; out.pointsDelta=nonneg(result.pointsGain); out.fichasDelta=nonneg(result.fichasGain); out.packsDelta=nonneg(result.standardPacksGain);
      out.stats={pointsEarned:out.pointsDelta,fichasEarned:out.fichasDelta,packsReceived:out.packsDelta}; break;
    case 'match.settle_reward':
      if(result?.penalty===true||result?.rewardReason==='abandon_penalty') return null;
      out.source='game_reward_server'; out.pointsDelta=Math.max(0,int(result.appliedDelta)); out.stats={pointsEarned:out.pointsDelta}; break;
    case 'match.abandon_penalty': {
      const delta=int(result.appliedDelta); out.source='abandon_penalty_server'; out.pointsDelta=delta;
      out.stats=delta<0?{pointsLost:Math.abs(delta)}:{}; break;
    }
    default: return null;
  }
  return out;
}

// Idempotent server-side side effect. This is deliberately separate from the canonical
// economy operation transaction for legacy operations whose transaction contracts predate
// schema 6. The event + public stat mirror are atomic with each other and keyed by operationId.
export async function recordAuthorityAudit(db,{uid,operationId,type,result,actorUid=null,metadata={}}){
  const derived=deriveAuthorityAudit(type,result); if(!derived) return {applied:false,reason:'not_economic'};
  const eventId=safeId(`${uid}_${operationId||type}`); if(!eventId) return {applied:false,reason:'missing_id'};
  return db.runTransaction(async tx=>{
    const userRef=db.collection('users').doc(uid), statsRef=db.collection('playerStats').doc(uid), eventRef=db.collection('economyEvents').doc(eventId);
    const [userSnap,statsSnap,eventSnap]=await Promise.all([tx.get(userRef),tx.get(statsRef),tx.get(eventRef)]);
    if(eventSnap.exists) return {applied:false,reason:'duplicate'};
    if(!userSnap.exists) return {applied:false,reason:'missing_user'};
    const profile=userSnap.data()||{}, current=statsSnap.exists?(statsSnap.data()||{}):{};
    tx.set(statsRef,playerStatsMirrorServer(uid,profile,current,derived.stats),{merge:false});
    tx.create(eventRef,{
      actorUid:String(actorUid||uid),targetUid:String(uid),source:derived.source,
      operationId:String(operationId||''),type:String(type||''),
      pointsDelta:derived.pointsDelta,fichasDelta:derived.fichasDelta,packsDelta:derived.packsDelta,cardsDelta:derived.cardsDelta,
      metadata:metadata&&typeof metadata==='object'?metadata:{},authority:'server',immutable:true,
      engineVersion:ENGINE_VERSION,economySchemaVersion:ECONOMY_SCHEMA_VERSION,createdAt:FieldValue.serverTimestamp()
    });
    return {applied:true};
  });
}
