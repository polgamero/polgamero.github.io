// HF23.3 — Ambient community players.
// Private/server-only bot identity lives here. Public surfaces receive only normal player
// profile/presence/stat shapes; no isBot marker is ever written to playerStats/playerPresence.
import crypto from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { TRUSTED_CARD_POOL } from '../trusted/cardCatalog.js';
import { PUBLISHED_CARD_BASELINE_IDS } from '../trusted/publishedCardBaseline.js';
import { playerStatsMirrorServer } from '../economy/audit.js';
import { getTradeMarketView, createTradeListingTx, cancelTradeListingTx, rejectTradeOfferTx, acceptTradeOfferTx } from '../economy/trade.js';
import { tradeCardTypeKey, cardFilterColors, TRADE_RARITIES } from '../economy/tradeCore.js';
import { normalizeMatchRewardConfig } from '../economy/matchCore.js';
import { dailyRewardForDay, dailyRewardTotals } from '../economy/dailyCore.js';

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
const AMBIENT_ECONOMY_MODEL_VERSION = 3;
const AMBIENT_STATS_MODEL_VERSION = 3;

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


function ambientDailyTotalsForClaims(claimCount = 0) {
  const claims=Math.max(0,Math.floor(Number(claimCount)||0));
  const cycles=Math.floor(claims/7), remainder=claims%7;
  const cycleTotals={points:0,fichas:0,standardPacks:0,guaranteedMythics:0};
  for(let day=1;day<=7;day++) {
    const reward=dailyRewardForDay(day);
    const totals=dailyRewardTotals(reward?.rewards||[]);
    for(const key of Object.keys(cycleTotals)) cycleTotals[key]+=Math.max(0,Math.floor(Number(totals[key])||0));
  }
  const out=Object.fromEntries(Object.entries(cycleTotals).map(([key,value])=>[key,value*cycles]));
  for(let day=1;day<=remainder;day++) {
    const reward=dailyRewardForDay(day);
    const totals=dailyRewardTotals(reward?.rewards||[]);
    for(const key of Object.keys(out)) out[key]+=Math.max(0,Math.floor(Number(totals[key])||0));
  }
  return out;
}

function ambientEconomyFromStats(stats = {}, rewardConfig = normalizeMatchRewardConfig({})) {
  const wins=Math.max(0,Math.floor(Number(stats.multiplayerWins)||0));
  const losses=Math.max(0,Math.floor(Number(stats.multiplayerLosses)||0));
  const dailyClaims=Math.max(0,Math.floor(Number(stats.dailyRewardsClaimed)||0));
  const daily=ambientDailyTotalsForClaims(dailyClaims);
  return {
    points:wins*Math.max(0,Math.floor(Number(rewardConfig?.pvp?.win)||0)) + losses*Math.max(0,Math.floor(Number(rewardConfig?.pvp?.loss)||0)) + daily.points,
    fichas:daily.fichas,
    standardPacks:daily.standardPacks,
    guaranteedMythics:daily.guaranteedMythics,
    pointsEarned:wins*Math.max(0,Math.floor(Number(rewardConfig?.pvp?.win)||0)) + losses*Math.max(0,Math.floor(Number(rewardConfig?.pvp?.loss)||0)) + daily.points,
    fichasEarned:daily.fichas,
    packsReceived:daily.standardPacks
  };
}

function listingLifetimeMinutes(listing = {}, uid = '', cfg = normalizeCommunityBotConfig({})) {
  const min=Math.max(15,Math.floor(Number(cfg.listingLifetimeMinMinutes)||90));
  const max=Math.max(min,Math.floor(Number(cfg.listingLifetimeMaxMinutes)||360));
  const span=max-min;
  return min + (span ? hashInt('listing-life',uid,listing.listingId||'',listing.cardId||'')%(span+1) : 0);
}

export function normalizeCommunityBotConfig(raw = {}) {
  const names = COMMUNITY_BOT_UIDS.map((_,i) => cleanName(Array.isArray(raw.names) ? raw.names[i] : '', COMMUNITY_BOT_DEFAULT_NAMES[i]));
  let startMinute = safeMinute(raw.activeStartMinute, 6*60);
  let endMinute = safeMinute(raw.activeEndMinute, 23*60+30);
  if (endMinute <= startMinute + 60) { startMinute = 6*60; endMinute = 23*60+30; }
  const challengeRejectMinSeconds = clampInt(raw.challengeRejectMinSeconds, 5, 3, 15);
  const challengeRejectMaxSeconds = Math.max(challengeRejectMinSeconds, clampInt(raw.challengeRejectMaxSeconds, 13, 5, 20));
  return {
    schemaVersion:2,
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
    listingLifetimeMinMinutes:clampInt(raw.listingLifetimeMinMinutes, 90, 15, 1440),
    listingLifetimeMaxMinutes:Math.max(
      clampInt(raw.listingLifetimeMinMinutes, 90, 15, 1440),
      clampInt(raw.listingLifetimeMaxMinutes, 360, 15, 2880)
    ),
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

function ambientHistoricalRecord(stats = {}, uid = '') {
  const existingGames=Math.max(0,Math.floor(Number(stats.gamesPlayed)||0));
  const existingWins=Math.max(0,Math.floor(Number(stats.wins)||0));
  const existingLosses=Math.max(0,Math.floor(Number(stats.losses)||0));
  const mpGames=Math.max(0,Math.floor(Number(stats.multiplayerGames)||0));
  const mpWins=Math.max(0,Math.floor(Number(stats.multiplayerWins)||0));
  const mpLosses=Math.max(0,Math.floor(Number(stats.multiplayerLosses)||0));
  const eloGames=Math.max(0,Math.floor(Number(stats.eloGames)||0));
  const eloWins=Math.max(0,Math.floor(Number(stats.eloWins)||0));
  const eloLosses=Math.max(0,Math.floor(Number(stats.eloLosses)||0));
  const games=Math.max(existingGames,mpGames,eloGames,existingWins+existingLosses,mpWins+mpLosses,eloWins+eloLosses);
  if(games<=0) return { games:0,wins:0,losses:0 };
  const coherent=existingWins+existingLosses===games && mpWins+mpLosses===games && eloWins+eloLosses===games
    && existingWins===mpWins && existingWins===eloWins && existingLosses===mpLosses && existingLosses===eloLosses
    && (games<2 || (existingWins>0 && existingLosses>0));
  if(coherent) return { games,wins:existingWins,losses:existingLosses };
  const targetPct=38 + (hashInt('ambient-win-rate',uid)%25); // 38..62%, deterministic per profile
  let wins=Math.round(games*targetPct/100);
  if(games>=2) wins=Math.max(1,Math.min(games-1,wins));
  else wins=deterministicPct('ambient-single-game',uid)<targetPct?1:0;
  return { games,wins,losses:games-wins };
}

function ambientHistoricalDurationMs(uid = '', games = 0) {
  const count=Math.max(0,Math.floor(Number(games)||0));
  if(!count) return 0;
  // Ranking only exposes the aggregate, but keep it in the same order of magnitude as real
  // matches: roughly 9..23 minutes per game plus non-round seconds so profiles do not line up.
  const avgMinutes=9+(hashInt('ambient-duration-average',uid)%15);
  const secondsJitter=hashInt('ambient-duration-seconds',uid,count)%55;
  return count*avgMinutes*60_000 + secondsJitter*1000;
}

function ambientGameDurationMs(uidA='', uidB='', day='', slot=0, index=0) {
  const minutes=8+(hashInt('ambient-game-duration',uidA,uidB,day,slot,index)%18); // 8..25 min
  const seconds=hashInt('ambient-game-duration-seconds',uidA,uidB,day,slot,index)%60;
  return minutes*60_000+seconds*1000;
}

function ambientTargetUniqueCards(uid='', botIndex=0, stats={}) {
  const games=Math.max(0,Math.floor(Number(stats.gamesPlayed)||0));
  const dailyClaims=Math.max(0,Math.floor(Number(stats.dailyRewardsClaimed)||0));
  const profileVariance=(hashInt('ambient-collection-baseline',uid)%9);
  return Math.min(220,80+botIndex*7+profileVariance+Math.min(75,Math.floor(games*1.35))+Math.min(28,dailyClaims));
}

function buildInitialCollection(botIndex, targetUnique = 80) {
  const out=[];
  if (!baselineCards.length) return out;
  const stride=17;
  const count=Math.max(1,Math.min(baselineCards.length,Math.floor(Number(targetUnique)||80)));
  for(let i=0;i<count;i++) {
    const card=baselineCards[(botIndex*131 + i*stride) % baselineCards.length];
    out.push(String(card.id), String(card.id));
  }
  return out;
}

function ensureAmbientCollectionDiversity(collection, botIndex, uid, stats={}) {
  const current=Array.isArray(collection)?collection.map(String):[];
  const target=ambientTargetUniqueCards(uid,botIndex,stats);
  const seen=new Set(current);
  if(seen.size>=target || !baselineCards.length) return current;
  const stride=17;
  for(let i=0;i<baselineCards.length && seen.size<target;i++) {
    const cardId=String(baselineCards[(botIndex*131 + i*stride) % baselineCards.length].id);
    if(seen.has(cardId)) continue;
    current.push(cardId,cardId);
    seen.add(cardId);
  }
  return current;
}

export async function ensureCommunityBotsProvisioned(db, config = null, nowMs = Date.now()) {
  const cfg = config || await loadCommunityBotConfig(db);
  const settingsSnap=await db.doc('gameConfig/settings').get();
  const rewardConfig=normalizeMatchRewardConfig(settingsSnap.exists ? settingsSnap.data()||{} : {});
  for (let i=0;i<COMMUNITY_BOT_UIDS.length;i++) {
    const uid=COMMUNITY_BOT_UIDS[i], userRef=db.doc(`users/${uid}`), statsRef=db.doc(`playerStats/${uid}`);
    await db.runTransaction(async tx=>{
      const [userSnap,statsSnap]=await Promise.all([tx.get(userRef),tx.get(statsRef)]);
      const existing=userSnap.exists ? userSnap.data()||{} : {};
      const currentStats=statsSnap.exists ? statsSnap.data()||{} : {};
      const historical=ambientHistoricalRecord(currentStats,uid);
      const existingDuration=Math.max(0,Math.floor(Number(currentStats.totalDurationMs)||0));
      const statsNeedRepair=Math.floor(Number(existing.ambientStatsModelVersion)||0)<AMBIENT_STATS_MODEL_VERSION
        || Math.max(0,Math.floor(Number(currentStats.gamesPlayed)||0))!==historical.games
        || Math.max(0,Math.floor(Number(currentStats.wins)||0))!==historical.wins
        || Math.max(0,Math.floor(Number(currentStats.losses)||0))!==historical.losses
        || (historical.games>0 && existingDuration<=0);
      const historicalStats=statsNeedRepair ? {
        ...currentStats,
        gamesPlayed:historical.games, multiplayerGames:historical.games, soloGames:0,
        wins:historical.wins, losses:historical.losses,
        multiplayerWins:historical.wins, multiplayerLosses:historical.losses,
        soloWins:0, soloLosses:0,
        eloGames:historical.games, eloWins:historical.wins, eloLosses:historical.losses,
        totalDurationMs:historical.games>0 ? (existingDuration>0?existingDuration:ambientHistoricalDurationMs(uid,historical.games)) : 0
      } : currentStats;
      const needsEconomyRepair=Math.floor(Number(existing.ambientEconomyModelVersion)||0)<AMBIENT_ECONOMY_MODEL_VERSION || statsNeedRepair;
      const rebuilt=needsEconomyRepair ? ambientEconomyFromStats(historicalStats,rewardConfig) : null;
      const currentInventory=existing.inventory && typeof existing.inventory==='object' ? existing.inventory : {standardPacks:0,guaranteedMythics:0};
      const normalizedCollection=ensureAmbientCollectionDiversity(
        Array.isArray(existing.collection)&&existing.collection.length ? existing.collection : buildInitialCollection(i,ambientTargetUniqueCards(uid,i,historicalStats)),
        i,uid,historicalStats
      );
      const profile={
        ...existing,
        username:cfg.names[i], displayName:cfg.names[i],
        email:`${uid}@internal.argentinia.invalid`,
        isSystemBot:true, systemRole:'ambient_player',
        // HF23.3.6: fake public balances are never random integers. On first migration we
        // rebuild them exclusively from already-simulated PvP W/L + the real 7-day Daily table.
        points:needsEconomyRepair ? rebuilt.points : Math.max(0,Math.floor(Number(existing.points)||0)),
        fichas:needsEconomyRepair ? rebuilt.fichas : Math.max(0,Math.floor(Number(existing.fichas)||0)),
        inventory:needsEconomyRepair ? {
          ...currentInventory,
          standardPacks:rebuilt.standardPacks,
          guaranteedMythics:rebuilt.guaranteedMythics
        } : currentInventory,
        ambientEconomyModelVersion:AMBIENT_ECONOMY_MODEL_VERSION,
        ambientStatsModelVersion:AMBIENT_STATS_MODEL_VERSION,
        collection:normalizedCollection,
        decks:Array.isArray(existing.decks) ? existing.decks : [],
        enhancements:existing.enhancements && typeof existing.enhancements==='object' && !Array.isArray(existing.enhancements) ? existing.enhancements : {},
        createdAtMs:Math.max(0,Number(existing.createdAtMs)||nowMs),
        updatedAtMs:nowMs
      };
      const repairedStats=needsEconomyRepair ? {
        ...historicalStats,
        pointsEarned:rebuilt.pointsEarned,
        pointsSpent:0,
        pointsLost:0,
        fichasEarned:rebuilt.fichasEarned,
        fichasSpent:0,
        packsReceived:rebuilt.packsReceived
      } : historicalStats;
      const seeded={...repairedStats,eloRating:Math.max(1050,Math.min(1350,Math.floor(Number(repairedStats.eloRating)||1120+i*45))),eloPeak:Math.max(1200,Math.floor(Number(repairedStats.eloPeak)||1200))};
      tx.set(userRef,profile,{merge:false});
      tx.set(statsRef,playerStatsMirrorServer(uid,profile,seeded),{merge:false});
    });
  }
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
    const profile=u.data()||{}, currentStats=s.exists?s.data()||{}:{};
    const claimCount=Math.max(0,Math.floor(Number(currentStats.dailyRewardsClaimed)||0));
    const rewardDay=(claimCount%7)+1;
    const reward=dailyRewardForDay(rewardDay);
    const totals=dailyRewardTotals(reward?.rewards||[]);
    const inventory=profile.inventory && typeof profile.inventory==='object' ? profile.inventory : {standardPacks:0,guaranteedMythics:0};
    const next={
      ...profile,
      points:Math.max(0,Math.floor(Number(profile.points)||0))+Math.max(0,Math.floor(Number(totals.points)||0)),
      fichas:Math.max(0,Math.floor(Number(profile.fichas)||0))+Math.max(0,Math.floor(Number(totals.fichas)||0)),
      inventory:{
        ...inventory,
        standardPacks:Math.max(0,Math.floor(Number(inventory.standardPacks)||0))+Math.max(0,Math.floor(Number(totals.standardPacks)||0)),
        guaranteedMythics:Math.max(0,Math.floor(Number(inventory.guaranteedMythics)||0))+Math.max(0,Math.floor(Number(totals.guaranteedMythics)||0))
      },
      ambientEconomyModelVersion:AMBIENT_ECONOMY_MODEL_VERSION,
      updatedAtMs:nowMs
    };
    batch.set(userRef,next,{merge:false});
    batch.set(statsRef,playerStatsMirrorServer(uid,next,currentStats,{
      dailyRewardsClaimed:1,
      pointsEarned:totals.points,
      fichasEarned:totals.fichas,
      packsReceived:totals.standardPacks
    }),{merge:false});
  }
  batch.set(stateRef,{lastDailyKey:day,lastDailyMs:nowMs},{merge:true});
  await batch.commit(); return true;
}

async function simulateBotGames(db, cfg, nowMs) {
  if(cfg.simulatedGamesPerTick<=0) return 0;
  const settingsSnap=await db.doc('gameConfig/settings').get();
  const rewardConfig=normalizeMatchRewardConfig(settingsSnap.exists ? settingsSnap.data()||{} : {});
  let done=0;
  const day=argentinaDayKey(nowMs), minute=minuteOfDayFromArgentinaMs(nowMs), slot=Math.floor(minute/cfg.activityIntervalMinutes);
  for(let i=0;i<cfg.simulatedGamesPerTick;i++) {
    const a=(hashInt('game-a',day,slot,i)%COMMUNITY_BOT_UIDS.length), b=(a+1+(hashInt('game-b',day,slot,i)%4))%COMMUNITY_BOT_UIDS.length;
    const uidA=COMMUNITY_BOT_UIDS[a],uidB=COMMUNITY_BOT_UIDS[b];
    const aWins=deterministicPct('winner',day,slot,i)<50;
    const durationMs=ambientGameDurationMs(uidA,uidB,day,slot,i);
    const rewardA=Math.max(0,Math.floor(Number(aWins?rewardConfig.pvp.win:rewardConfig.pvp.loss)||0));
    const rewardB=Math.max(0,Math.floor(Number(aWins?rewardConfig.pvp.loss:rewardConfig.pvp.win)||0));
    const applied=await db.runTransaction(async tx=>{
      const userRefA=db.doc(`users/${uidA}`),userRefB=db.doc(`users/${uidB}`),refA=db.doc(`playerStats/${uidA}`),refB=db.doc(`playerStats/${uidB}`);
      const [ua,ub,sa,sb]=await Promise.all([tx.get(userRefA),tx.get(userRefB),tx.get(refA),tx.get(refB)]); if(!ua.exists||!ub.exists||!sa.exists||!sb.exists) return false;
      const pa=ua.data()||{},pb=ub.data()||{},da=sa.data()||{},dbb=sb.data()||{};
      const nextRating=(rating,delta)=>Math.max(1050,Math.min(1350,Math.floor(Number(rating)||1200)+delta));
      const ratingA=nextRating(da.eloRating,aWins?8:-8),ratingB=nextRating(dbb.eloRating,aWins?-8:8);
      const profileA={...pa,points:Math.max(0,Math.floor(Number(pa.points)||0))+rewardA,ambientEconomyModelVersion:AMBIENT_ECONOMY_MODEL_VERSION,ambientStatsModelVersion:AMBIENT_STATS_MODEL_VERSION,updatedAtMs:nowMs};
      const profileB={...pb,points:Math.max(0,Math.floor(Number(pb.points)||0))+rewardB,ambientEconomyModelVersion:AMBIENT_ECONOMY_MODEL_VERSION,ambientStatsModelVersion:AMBIENT_STATS_MODEL_VERSION,updatedAtMs:nowMs};
      const baseA={...da,eloRating:ratingA,eloPeak:Math.max(Math.floor(Number(da.eloPeak)||1200),ratingA)};
      const baseB={...dbb,eloRating:ratingB,eloPeak:Math.max(Math.floor(Number(dbb.eloPeak)||1200),ratingB)};
      const deltasA={gamesPlayed:1,multiplayerGames:1,wins:aWins?1:0,losses:aWins?0:1,multiplayerWins:aWins?1:0,multiplayerLosses:aWins?0:1,eloGames:1,eloWins:aWins?1:0,eloLosses:aWins?0:1,totalDurationMs:durationMs,pointsEarned:rewardA};
      const deltasB={gamesPlayed:1,multiplayerGames:1,wins:aWins?0:1,losses:aWins?1:0,multiplayerWins:aWins?0:1,multiplayerLosses:aWins?1:0,eloGames:1,eloWins:aWins?0:1,eloLosses:aWins?1:0,totalDurationMs:durationMs,pointsEarned:rewardB};
      tx.set(userRefA,profileA,{merge:false}); tx.set(userRefB,profileB,{merge:false});
      tx.set(refA,playerStatsMirrorServer(uidA,profileA,baseA,deltasA),{merge:false});
      tx.set(refB,playerStatsMirrorServer(uidB,profileB,baseB,deltasB),{merge:false});
      return true;
    });
    if(applied) done++;
  }
  return done;
}

function chooseTradableCard(view, uid, nowMs) {
  const ids=Object.entries(view?.tradableCounts||{}).filter(([,n])=>Number(n)>0).map(([id])=>id);
  if(!ids.length) return '';
  return ids[hashInt('listing-card',uid,nowMs)%ids.length];
}

function canonicalTradeRarity(card) {
  const raw=String(card?.rarity||'Common').toLowerCase().replace(/[^a-z]/g,'');
  if(raw==='mythic'||raw==='mythicrare') return 'Mythic';
  if(raw==='rare') return 'Rare';
  if(raw==='uncommon') return 'Uncommon';
  return 'Common';
}

export function buildAmbientWantedCriteria(cardId, uid='', nowMs=Date.now()) {
  // HF23.3.5 — ambient listings must look like plausible player listings. They never use
  // the suspicious historical "acepto cualquier carta": every publication asks for a
  // bounded combination derived from the value/type/color of the card being offered.
  // The choice and number of OR criteria vary deterministically by bot/card/day so the
  // five ambient profiles do not all publish the exact same BUSCO pattern.
  const card=cardById.get(String(cardId));
  if(!card) return [{type:'attributes',cardType:null,color:null,rarity:'Common'}];
  const rarity=canonicalTradeRarity(card);
  const cardType=tradeCardTypeKey(card)||null;
  const colors=cardFilterColors(card);
  const color=colors.length ? colors[hashInt('wanted-color',uid,cardId,Math.floor(nowMs/DAY_MS))%colors.length] : null;
  const rarityIndex=TRADE_RARITIES.indexOf(rarity);
  const candidates=[];
  const pushCandidate=(entry)=>{
    if(!entry.cardType && !entry.color && !entry.rarity) return;
    const key=JSON.stringify(entry);
    if(!candidates.some(x=>JSON.stringify(x)===key)) candidates.push(entry);
  };
  // Primary intent: comparable card. When color exists, combining type+color+rarity is
  // intentionally stricter and reads much more like a real BUSCO than "cualquier carta".
  pushCandidate({type:'attributes',cardType,color,rarity});
  pushCandidate({type:'attributes',cardType,color:null,rarity});
  pushCandidate({type:'attributes',cardType:null,color,rarity});
  // Trading upward is coherent and still protected by the independent rarity guard.
  if(rarityIndex>=0 && rarityIndex<TRADE_RARITIES.length-1) {
    pushCandidate({type:'attributes',cardType,color:null,rarity:TRADE_RARITIES[rarityIndex+1]});
  }
  const seedDay=Math.floor(nowMs/DAY_MS);
  const ordered=[...candidates].sort((a,b)=>hashInt('wanted-order',uid,cardId,seedDay,JSON.stringify(a))-hashInt('wanted-order',uid,cardId,seedDay,JSON.stringify(b)));
  const wantedCount=Math.min(ordered.length,1+(hashInt('wanted-count',uid,cardId,seedDay)%3));
  return ordered.slice(0,Math.max(1,wantedCount));
}

async function advanceBotMarket(db, cfg, nowMs) {
  if(cfg.maxListingsPerBot<=0) return { accepted:0,rejected:0,canceled:0,created:0 };
  let accepted=0,rejected=0,canceled=0,created=0;
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
    // HF23.3.6 — market churn. Each listing has a deterministic but different lifetime.
    // We only retire an idle listing: an active human offer is resolved first and never
    // silently thrown away just because the ambient post became old.
    const stale=own.filter(listing=>{
      const createdAtMs=Math.max(0,Number(listing.createdAtMs)||0);
      const ageMs=Math.max(0,nowMs-createdAtMs);
      return createdAtMs>0 && Math.max(0,Math.floor(Number(listing.offerCount)||0))===0 && ageMs>=listingLifetimeMinutes(listing,uid,cfg)*60_000;
    }).sort((a,b)=>(Number(a.createdAtMs)||0)-(Number(b.createdAtMs)||0));
    let effectiveOwnCount=own.length;
    if(stale.length) {
      try {
        await db.runTransaction(tx=>cancelTradeListingTx({db,tx,uid,listingId:stale[0].listingId,nowMs}));
        canceled++; effectiveOwnCount=Math.max(0,effectiveOwnCount-1);
      } catch {}
    }
    if(effectiveOwnCount<cfg.maxListingsPerBot) {
      const refreshed=stale.length ? await getTradeMarketView(db,uid).catch(()=>view) : view;
      const cardId=chooseTradableCard(refreshed,uid,nowMs); if(!cardId) continue;
      const operationId=`ambient_listing_${uid}_${nowMs}_${cardId}`;
      const wantedCriteria=buildAmbientWantedCriteria(cardId,uid,nowMs);
      try { await db.runTransaction(tx=>createTradeListingTx({db,tx,uid,operationId,cardId,wantedCriteria,acceptAnyCard:false,nowMs})); created++; } catch {}
    }
  }
  return {accepted,rejected,canceled,created};
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
  // Keep profile mutations ordered: games change points, Market swaps change collections.
  // Running both in parallel can make one transaction overwrite the other's user snapshot.
  const games=await simulateBotGames(db,cfg,nowMs);
  const market=await advanceBotMarket(db,cfg,nowMs);
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
