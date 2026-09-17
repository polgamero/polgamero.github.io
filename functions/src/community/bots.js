// HF23.3 — Ambient community players.
// Private/server-only bot identity lives here. Public surfaces receive only normal player
// profile/presence/stat shapes; no isBot marker is ever written to playerStats/playerPresence.
import crypto from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { TRUSTED_CARD_POOL } from '../trusted/cardCatalog.js';
import { PUBLISHED_CARD_BASELINE_IDS } from '../trusted/publishedCardBaseline.js';
import { playerStatsMirrorServer } from '../economy/audit.js';
import { getTradeMarketView, createTradeListingTx, rejectTradeOfferTx, acceptTradeOfferTx } from '../economy/trade.js';

export const COMMUNITY_BOT_CONFIG_PATH = 'communityBotConfig/main';
export const COMMUNITY_BOT_STATE_PATH = 'communityBotState/main';
export const COMMUNITY_BOT_UIDS = Object.freeze([
  'ambient_player_01','ambient_player_02','ambient_player_03','ambient_player_04','ambient_player_05'
]);
export const COMMUNITY_BOT_DEFAULT_NAMES = Object.freeze([
  'Toto del 92','Mora del Oeste','Nico del Pasaje','La Flaca de Barracas','El Gallego de Parque Patricios'
]);

const ARGENTINA_OFFSET_MS = -3 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const publishedBaseline = new Set(PUBLISHED_CARD_BASELINE_IDS.map(String));
const cardById = new Map(TRUSTED_CARD_POOL.map(card => [String(card.id), card]));
const baselineCards = TRUSTED_CARD_POOL.filter(card => publishedBaseline.has(String(card.id)));
const RARITY_RANK = Object.freeze({ common:0, uncommon:1, rare:2, mythic:3, mythicrare:3 });

function clampInt(value, fallback, min, max) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function clampPct(value, fallback) { return clampInt(value, fallback, 0, 100); }
function cleanName(value, fallback) {
  const v = String(value || '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g,' ').trim().slice(0,40);
  return v || fallback;
}
function minuteOfDayFromArgentinaMs(nowMs) {
  const d = new Date(Number(nowMs || Date.now()) + ARGENTINA_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function argentinaDayKey(nowMs) {
  const d = new Date(Number(nowMs || Date.now()) + ARGENTINA_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}
function hashInt(...parts) {
  const hex = crypto.createHash('sha256').update(parts.map(x=>String(x)).join('|')).digest('hex').slice(0,12);
  return Number.parseInt(hex,16);
}
function deterministicPct(...parts) { return hashInt(...parts) % 100; }
function safeMinute(value, fallback) { return clampInt(value, fallback, 0, 1439); }
function rarityRank(cardId) {
  const raw = String(cardById.get(String(cardId))?.rarity || 'common').toLowerCase().replace(/[^a-z]/g,'');
  return Object.prototype.hasOwnProperty.call(RARITY_RANK, raw) ? RARITY_RANK[raw] : 0;
}

export function normalizeCommunityBotConfig(raw = {}) {
  const names = COMMUNITY_BOT_UIDS.map((_,i) => cleanName(Array.isArray(raw.names) ? raw.names[i] : '', COMMUNITY_BOT_DEFAULT_NAMES[i]));
  let startMinute = safeMinute(raw.activeStartMinute, 6*60);
  let endMinute = safeMinute(raw.activeEndMinute, 23*60+30);
  if (endMinute <= startMinute + 60) { startMinute = 6*60; endMinute = 23*60+30; }
  const challengeRejectMinSeconds = clampInt(raw.challengeRejectMinSeconds, 5, 3, 15);
  const challengeRejectMaxSeconds = Math.max(challengeRejectMinSeconds, clampInt(raw.challengeRejectMaxSeconds, 13, 5, 20));
  return {
    schemaVersion:1,
    enabled:raw.enabled === true,
    names,
    visibleOnlineMax:clampInt(raw.visibleOnlineMax, 2, 0, 5),
    activeStartMinute:startMinute,
    activeEndMinute:endMinute,
    presenceSlotMinutes:clampInt(raw.presenceSlotMinutes, 20, 10, 60),
    onlineChancePct:clampPct(raw.onlineChancePct, 58),
    activityIntervalMinutes:clampInt(raw.activityIntervalMinutes, 20, 5, 120),
    simulatedGamesPerTick:clampInt(raw.simulatedGamesPerTick, 1, 0, 3),
    maxListingsPerBot:clampInt(raw.maxListingsPerBot, 2, 0, 5),
    acceptEqualPct:clampPct(raw.acceptEqualPct, 35),
    acceptHigherPct:clampPct(raw.acceptHigherPct, 70),
    rejectEligiblePct:clampPct(raw.rejectEligiblePct, 25),
    challengeRejectMinSeconds,
    challengeRejectMaxSeconds
  };
}

export async function loadCommunityBotConfig(db) {
  const snap = await db.doc(COMMUNITY_BOT_CONFIG_PATH).get();
  return normalizeCommunityBotConfig(snap.exists ? snap.data() || {} : {});
}

export async function setCommunityBotConfigAdmin(db, raw = {}, moderatorUid = '') {
  const config = normalizeCommunityBotConfig(raw);
  const nowMs = Date.now();
  await db.doc(COMMUNITY_BOT_CONFIG_PATH).set({
    ...config, updatedAtMs:nowMs, updatedAt:Timestamp.fromMillis(nowMs), updatedByUid:String(moderatorUid||'')
  }, { merge:false });
  await ensureCommunityBotsProvisioned(db, config, nowMs);
  await refreshCommunityBotPresence(db, config, nowMs, { force:true });
  return config;
}

function buildInitialCollection(botIndex) {
  // 72 distinct published cards x2 => enough real inventory for market rotation without
  // manufacturing cards during a trade. Offset per bot keeps their stock visibly different.
  const out=[];
  if (!baselineCards.length) return out;
  const stride=17;
  for(let i=0;i<72;i++) {
    const card=baselineCards[(botIndex*131 + i*stride) % baselineCards.length];
    out.push(String(card.id), String(card.id));
  }
  return out;
}

export async function ensureCommunityBotsProvisioned(db, config = null, nowMs = Date.now()) {
  const cfg = config || await loadCommunityBotConfig(db);
  const writes=[];
  for (let i=0;i<COMMUNITY_BOT_UIDS.length;i++) {
    const uid=COMMUNITY_BOT_UIDS[i], userRef=db.doc(`users/${uid}`), statsRef=db.doc(`playerStats/${uid}`);
    const [userSnap,statsSnap]=await Promise.all([userRef.get(),statsRef.get()]);
    const existing=userSnap.exists ? userSnap.data()||{} : {};
    const profile={
      ...existing,
      username:cfg.names[i], displayName:cfg.names[i],
      email:`${uid}@internal.argentinia.invalid`,
      isSystemBot:true, systemRole:'ambient_player',
      points:Math.max(0,Math.floor(Number(existing.points)||0)),
      fichas:Math.max(0,Math.floor(Number(existing.fichas)||0)),
      inventory:existing.inventory && typeof existing.inventory==='object' ? existing.inventory : {standardPacks:0,guaranteedMythics:0},
      collection:Array.isArray(existing.collection)&&existing.collection.length ? existing.collection : buildInitialCollection(i),
      decks:Array.isArray(existing.decks) ? existing.decks : [],
      enhancements:existing.enhancements && typeof existing.enhancements==='object' && !Array.isArray(existing.enhancements) ? existing.enhancements : {},
      createdAtMs:Math.max(0,Number(existing.createdAtMs)||nowMs),
      updatedAtMs:nowMs
    };
    writes.push(userRef.set(profile,{merge:false}));
    const currentStats=statsSnap.exists ? statsSnap.data()||{} : {};
    const seeded={...currentStats,eloRating:Math.max(1050,Math.min(1350,Math.floor(Number(currentStats.eloRating)||1120+i*45))),eloPeak:Math.max(1200,Math.floor(Number(currentStats.eloPeak)||1200))};
    writes.push(statsRef.set(playerStatsMirrorServer(uid,profile,seeded),{merge:false}));
  }
  await Promise.all(writes);
  return { count:COMMUNITY_BOT_UIDS.length };
}

export function computeCommunityBotPresence(config, nowMs = Date.now()) {
  const cfg=normalizeCommunityBotConfig(config);
  if(!cfg.enabled || cfg.visibleOnlineMax<=0) return [];
  const minute=minuteOfDayFromArgentinaMs(nowMs);
  if(minute<cfg.activeStartMinute || minute>cfg.activeEndMinute) return [];
  const day=argentinaDayKey(nowMs);
  const slot=Math.floor(minute/cfg.presenceSlotMinutes);
  const candidates=COMMUNITY_BOT_UIDS.map((uid,i)=>({
    uid,index:i,score:deterministicPct('presence',day,slot,uid),activityScore:deterministicPct('activity',day,slot,uid)
  })).filter(row=>row.score<cfg.onlineChancePct).sort((a,b)=>a.score-b.score).slice(0,cfg.visibleOnlineMax);
  return candidates.map(row=>({
    uid:row.uid,
    activity:row.activityScore<55?'multiplayer_lobby':'menu',
    availability:'available', visibility:'visible', difficulty:'', tournamentRoundKey:'',
    // Presence timestamps are ordinary server-shaped timestamps; no bot flag leaks here.
    lastSeenAt:Timestamp.fromMillis(nowMs), updatedAt:Timestamp.fromMillis(nowMs)
  }));
}

export async function refreshCommunityBotPresence(db, config = null, nowMs = Date.now(), { force=false } = {}) {
  const cfg=config || await loadCommunityBotConfig(db);
  const day=argentinaDayKey(nowMs), minute=minuteOfDayFromArgentinaMs(nowMs), slot=Math.floor(minute/cfg.presenceSlotMinutes);
  const stateRef=db.doc(COMMUNITY_BOT_STATE_PATH), stateSnap=await stateRef.get(), state=stateSnap.exists?stateSnap.data()||{}:{};
  const slotKey=`${day}:${slot}:${cfg.enabled?'1':'0'}:${cfg.visibleOnlineMax}:${cfg.onlineChancePct}`;
  const lastRefreshMs=Math.max(0,Number(state.lastPresenceRefreshMs)||0);
  if(!force && String(state.lastPresenceSlotKey||'')===slotKey && lastRefreshMs && nowMs-lastRefreshMs<60_000) return { refreshed:false, slotKey };
  const rows=computeCommunityBotPresence(cfg,nowMs), online=new Set(rows.map(r=>r.uid)), batch=db.batch();
  for(const uid of COMMUNITY_BOT_UIDS) {
    const ref=db.doc(`playerPresence/${uid}`);
    if(online.has(uid)) {
      const row=rows.find(r=>r.uid===uid);
      batch.set(ref,{activity:row.activity,availability:'available',visibility:'visible',difficulty:'',tournamentRoundKey:'',engineVersion:'23.21.6',engineProtocolVersion:'mp-23.19.2',lastSeenAt:Timestamp.fromMillis(nowMs),updatedAt:Timestamp.fromMillis(nowMs)},{merge:false});
    } else batch.delete(ref);
  }
  batch.set(stateRef,{lastPresenceSlotKey:slotKey,lastPresenceRefreshMs:nowMs,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  await batch.commit();
  return { refreshed:true, slotKey, online:rows.length };
}

export async function isCommunityBotUid(db, uid) {
  const id=String(uid||'');
  if(!COMMUNITY_BOT_UIDS.includes(id)) return false;
  const cfg=await loadCommunityBotConfig(db);
  return cfg.enabled;
}

export async function challengeTtlForTarget(db, targetUid, nowMs = Date.now()) {
  const uid=String(targetUid||'');
  if(!COMMUNITY_BOT_UIDS.includes(uid)) return null;
  const cfg=await loadCommunityBotConfig(db);
  if(!cfg.enabled) return null;
  const presence=computeCommunityBotPresence(cfg,nowMs).find(row=>row.uid===uid);
  if(!presence) return null;
  const span=Math.max(0,cfg.challengeRejectMaxSeconds-cfg.challengeRejectMinSeconds);
  const seconds=cfg.challengeRejectMinSeconds + (span ? hashInt('decline',uid,nowMs)%(span+1) : 0);
  return seconds*1000;
}

export async function expiredChallengeStatusForTarget(db, targetUid) {
  return await isCommunityBotUid(db,targetUid) ? 'rejected' : 'expired';
}

async function applyBotDailyProgression(db, cfg, nowMs) {
  const day=argentinaDayKey(nowMs), stateRef=db.doc(COMMUNITY_BOT_STATE_PATH), snap=await stateRef.get(), state=snap.exists?snap.data()||{}:{};
  if(String(state.lastDailyKey||'')===day) return false;
  const batch=db.batch();
  for(let i=0;i<COMMUNITY_BOT_UIDS.length;i++) {
    const uid=COMMUNITY_BOT_UIDS[i], userRef=db.doc(`users/${uid}`), statsRef=db.doc(`playerStats/${uid}`);
    const [u,s]=await Promise.all([userRef.get(),statsRef.get()]); if(!u.exists) continue;
    const profile=u.data()||{}, pointsGain=40+(hashInt('daily-points',day,uid)%81), fichasGain=hashInt('daily-fichas',day,uid)%4;
    const next={...profile,points:Math.max(0,Math.floor(Number(profile.points)||0))+pointsGain,fichas:Math.max(0,Math.floor(Number(profile.fichas)||0))+fichasGain,updatedAtMs:nowMs};
    batch.set(userRef,next,{merge:false});
    batch.set(statsRef,playerStatsMirrorServer(uid,next,s.exists?s.data()||{}:{},{dailyRewardsClaimed:1,pointsEarned:pointsGain,fichasEarned:fichasGain}),{merge:false});
  }
  batch.set(stateRef,{lastDailyKey:day,lastDailyMs:nowMs},{merge:true});
  await batch.commit(); return true;
}

async function simulateBotGames(db, cfg, nowMs) {
  if(cfg.simulatedGamesPerTick<=0) return 0;
  let done=0;
  const day=argentinaDayKey(nowMs), minute=minuteOfDayFromArgentinaMs(nowMs), slot=Math.floor(minute/cfg.activityIntervalMinutes);
  for(let i=0;i<cfg.simulatedGamesPerTick;i++) {
    const a=(hashInt('game-a',day,slot,i)%COMMUNITY_BOT_UIDS.length), b=(a+1+(hashInt('game-b',day,slot,i)%4))%COMMUNITY_BOT_UIDS.length;
    const uidA=COMMUNITY_BOT_UIDS[a],uidB=COMMUNITY_BOT_UIDS[b], refA=db.doc(`playerStats/${uidA}`),refB=db.doc(`playerStats/${uidB}`);
    const [sa,sb]=await Promise.all([refA.get(),refB.get()]); if(!sa.exists||!sb.exists) continue;
    const da=sa.data()||{},dbb=sb.data()||{}; const aWins=deterministicPct('winner',day,slot,i)<50;
    const nextRating=(rating,delta)=>Math.max(1050,Math.min(1350,Math.floor(Number(rating)||1200)+delta));
    const nextA={...da,eloRating:nextRating(da.eloRating,aWins?8:-8),eloPeak:Math.max(Math.floor(Number(da.eloPeak)||1200),nextRating(da.eloRating,aWins?8:-8)),eloGames:Math.max(0,Math.floor(Number(da.eloGames)||0))+1,eloWins:Math.max(0,Math.floor(Number(da.eloWins)||0))+(aWins?1:0),eloLosses:Math.max(0,Math.floor(Number(da.eloLosses)||0))+(aWins?0:1),gamesPlayed:Math.max(0,Math.floor(Number(da.gamesPlayed)||0))+1,multiplayerGames:Math.max(0,Math.floor(Number(da.multiplayerGames)||0))+1,multiplayerWins:Math.max(0,Math.floor(Number(da.multiplayerWins)||0))+(aWins?1:0),multiplayerLosses:Math.max(0,Math.floor(Number(da.multiplayerLosses)||0))+(aWins?0:1),updatedAt:FieldValue.serverTimestamp()};
    const nextB={...dbb,eloRating:nextRating(dbb.eloRating,aWins?-8:8),eloPeak:Math.max(Math.floor(Number(dbb.eloPeak)||1200),nextRating(dbb.eloRating,aWins?-8:8)),eloGames:Math.max(0,Math.floor(Number(dbb.eloGames)||0))+1,eloWins:Math.max(0,Math.floor(Number(dbb.eloWins)||0))+(aWins?0:1),eloLosses:Math.max(0,Math.floor(Number(dbb.eloLosses)||0))+(aWins?1:0),gamesPlayed:Math.max(0,Math.floor(Number(dbb.gamesPlayed)||0))+1,multiplayerGames:Math.max(0,Math.floor(Number(dbb.multiplayerGames)||0))+1,multiplayerWins:Math.max(0,Math.floor(Number(dbb.multiplayerWins)||0))+(aWins?0:1),multiplayerLosses:Math.max(0,Math.floor(Number(dbb.multiplayerLosses)||0))+(aWins?1:0),updatedAt:FieldValue.serverTimestamp()};
    await Promise.all([refA.set(nextA,{merge:false}),refB.set(nextB,{merge:false})]); done++;
  }
  return done;
}

function chooseTradableCard(view, uid, nowMs) {
  const ids=Object.entries(view?.tradableCounts||{}).filter(([,n])=>Number(n)>0).map(([id])=>id);
  if(!ids.length) return '';
  return ids[hashInt('listing-card',uid,nowMs)%ids.length];
}

async function advanceBotMarket(db, cfg, nowMs) {
  if(cfg.maxListingsPerBot<=0) return { accepted:0,rejected:0,created:0 };
  let accepted=0,rejected=0,created=0;
  for(const uid of COMMUNITY_BOT_UIDS) {
    let view; try { view=await getTradeMarketView(db,uid); } catch { continue; }
    const offers=Array.isArray(view.receivedOffers)?view.receivedOffers:[];
    if(offers.length) {
      const offer=offers[hashInt('offer-pick',uid,nowMs)%offers.length];
      const listedRank=rarityRank(offer.listedCardId), offeredRank=rarityRank(offer.offeredCardId);
      if(offeredRank<listedRank) {
        try { await db.runTransaction(tx=>rejectTradeOfferTx({db,tx,uid,offerId:offer.offerId,nowMs})); rejected++; } catch {}
      } else {
        const pct=offeredRank>listedRank?cfg.acceptHigherPct:cfg.acceptEqualPct;
        const roll=deterministicPct('offer-decision',uid,offer.offerId,Math.floor(nowMs/60000));
        if(roll<pct) {
          try { await db.runTransaction(tx=>acceptTradeOfferTx({db,tx,uid,offerId:offer.offerId,operationId:`ambient_trade_${uid}_${nowMs}`,nowMs,suppressPublicTradeStats:true})); accepted++; continue; } catch {}
        }
        if(roll<pct+cfg.rejectEligiblePct) {
          try { await db.runTransaction(tx=>rejectTradeOfferTx({db,tx,uid,offerId:offer.offerId,nowMs})); rejected++; } catch {}
        }
      }
    }
    const own=Array.isArray(view.ownListings)?view.ownListings:[];
    if(own.length<cfg.maxListingsPerBot) {
      const cardId=chooseTradableCard(view,uid,nowMs); if(!cardId) continue;
      const operationId=`ambient_listing_${uid}_${Math.floor(nowMs/(cfg.activityIntervalMinutes*60000))}`;
      try { await db.runTransaction(tx=>createTradeListingTx({db,tx,uid,operationId,cardId,wantedCriteria:[],acceptAnyCard:true,nowMs})); created++; } catch {}
    }
  }
  return {accepted,rejected,created};
}

export async function advanceCommunityBots(db, { nowMs=Date.now(), force=false } = {}) {
  const cfg=await loadCommunityBotConfig(db);
  if(!cfg.enabled) { await refreshCommunityBotPresence(db,cfg,nowMs,{force}); return {enabled:false}; }
  await ensureCommunityBotsProvisioned(db,cfg,nowMs);
  await refreshCommunityBotPresence(db,cfg,nowMs,{force});
  const stateRef=db.doc(COMMUNITY_BOT_STATE_PATH), intervalMs=cfg.activityIntervalMinutes*60_000;
  const claimed=await db.runTransaction(async tx=>{
    const snap=await tx.get(stateRef), state=snap.exists?snap.data()||{}:{}; const last=Math.max(0,Number(state.lastActivityMs)||0);
    if(!force && last && nowMs-last<intervalMs) return false;
    tx.set(stateRef,{lastActivityMs:nowMs,updatedAt:FieldValue.serverTimestamp()},{merge:true}); return true;
  });
  if(!claimed) return {enabled:true,advanced:false};
  const daily=await applyBotDailyProgression(db,cfg,nowMs);
  const [games,market]=await Promise.all([simulateBotGames(db,cfg,nowMs),advanceBotMarket(db,cfg,nowMs)]);
  return {enabled:true,advanced:true,daily,games,market};
}

export async function getCommunityBotAdminSnapshot(db) {
  const [config,stateSnap]=await Promise.all([loadCommunityBotConfig(db),db.doc(COMMUNITY_BOT_STATE_PATH).get()]);
  return {
    config,
    botUids:[...COMMUNITY_BOT_UIDS],
    profiles:COMMUNITY_BOT_UIDS.map((uid,i)=>({uid,name:config.names[i]})),
    runtime:stateSnap.exists?stateSnap.data()||{}:{}
  };
}
