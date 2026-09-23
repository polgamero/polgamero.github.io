// HF23.3.16 — Public player profile snapshot.
// Server-side sanitizer: never expose email, balances, deck lists, collection IDs or moderation data.
import {
  ACHIEVEMENT_FAMILIES,
  ACHIEVEMENT_TIERS,
  achievementId,
  achievementMetricValue,
  normalizeAchievementsConfig,
  normalizeAchievementProfile
} from '../economy/achievements.js';
import { economyError } from '../shared/errors.js';
import { TRUSTED_CARD_POOL, TRUSTED_CARD_IDS } from '../trusted/cardCatalog.js';
import { favoriteCardIdIfOwned, parseFavoriteCardId } from '../shared/profileFavorite.js';
import { loadCardPublicationPolicy, cardEnabledByPolicy } from '../trusted/cardPublication.js';


const TRUSTED_CARD_BY_ID = new Map(TRUSTED_CARD_POOL.map(card => [String(card.id), card]));
const COSMETIC_ID_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/i;
function cleanCosmeticId(value) {
  const id=String(value||'').trim();
  return id && COSMETIC_ID_RE.test(id) ? id : '';
}
export function normalizePublicProfileCosmetics(raw={}) {
  const source=raw && typeof raw==='object' && !Array.isArray(raw) ? raw : {};
  return Object.freeze({
    schemaVersion:1,
    backgroundId:cleanCosmeticId(source.backgroundId),
    nameBadgeId:cleanCosmeticId(source.nameBadgeId),
    frameId:cleanCosmeticId(source.frameId),
    titleId:cleanCosmeticId(source.titleId)
  });
}

const PUBLIC_STAT_KEYS = Object.freeze([
  'gamesPlayed','soloGames','multiplayerGames','wins','losses','soloWins','soloLosses',
  'multiplayerWins','multiplayerLosses','abandons','totalDurationMs','pointsEarned',
  'packsReceived','packsOpened','guaranteedMythicsOpened','tournamentsPlayed','tournamentMatches',
  'tournamentWins','tournamentLosses','tournamentQuarterfinals','tournamentSemifinals','tournamentFinals',
  'tournamentChampionships','tournamentForfeits','tradesCompleted','eloRating','eloPeak','eloGames','eloWins','eloLosses',
  'basicLandPacksPurchased','basicLandsReceived','storePacksPurchased','enhancementsCrafted','prebuiltDecksPurchased',
  'classifiedsCardsPurchased','emotesPurchased','dailyRewardsClaimed','workshopMachinesUnlocked','achievementClaims',
  'cardsEvolved','industrialMixes','uniqueCards','cardsOwned'
]);

const nonneg = value => Math.max(0, Math.floor(Number(value) || 0));
function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return Math.max(0, value.toMillis());
  if (value instanceof Date) return Math.max(0, value.getTime());
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
function cleanUid(value) {
  const uid=String(value||'').trim();
  if(!uid || uid.length>128 || uid.includes('/')) throw economyError('PUBLIC_PROFILE_TARGET_INVALID');
  return uid;
}
function safePhotoURL(value) {
  const raw=String(value||'').trim();
  if(!raw) return '';
  try { const u=new URL(raw); return u.protocol==='https:' ? raw.slice(0,1200) : ''; } catch { return ''; }
}
function publicStats(raw={}) {
  const out={};
  for(const key of PUBLIC_STAT_KEYS) out[key]=nonneg(raw?.[key]);
  out.eloRating=Math.max(1,nonneg(raw?.eloRating)||1200);
  out.eloPeak=Math.max(out.eloRating,nonneg(raw?.eloPeak)||1200);
  return out;
}

export function buildPublicPlayerProfile({ uid, profile={}, stats={}, achievementsConfig={} }={}) {
  const targetUid=cleanUid(uid);
  const safeStats=publicStats(stats);
  const config=normalizeAchievementsConfig(achievementsConfig);
  const claimed=normalizeAchievementProfile(profile?.achievements).claimed;
  const achievements=ACHIEVEMENT_FAMILIES.map(family=>{
    const current=achievementMetricValue({profile,stats:safeStats,metric:family.metric});
    const tiers=ACHIEVEMENT_TIERS.map(tier=>{
      const row=config.entries[achievementId(family.id,tier)];
      return {
        tier,
        enabled:row?.enabled!==false,
        target:Math.max(1,nonneg(row?.target)||1),
        reached:row?.enabled!==false && current>=Math.max(1,nonneg(row?.target)||1),
        claimed:!!claimed[achievementId(family.id,tier)]
      };
    });
    const highestClaimed=[...tiers].reverse().find(row=>row.claimed)?.tier || '';
    return { familyId:family.id, metric:family.metric, current, highestClaimed, tiers };
  });
  const favoriteCardId=favoriteCardIdIfOwned(profile);
  const favoriteParsed=parseFavoriteCardId(favoriteCardId);
  const favoriteCard= favoriteCardId ? TRUSTED_CARD_BY_ID.get(favoriteParsed.baseId) : null;
  const favoriteCardEnhancementKeyword=favoriteCardId && favoriteParsed.variant==='enhanced'
    ? String(profile?.enhancements?.[favoriteParsed.baseId] || '').trim().slice(0,80) : '';
  return {
    schemaVersion:3,
    uid:targetUid,
    username:String(profile?.username||profile?.displayName||stats?.username||'Jugador').trim().slice(0,40)||'Jugador',
    photoURL:safePhotoURL(profile?.photoURL),
    joinedAtMs:timestampMs(profile?.createdAt),
    favoriteCardId,
    favoriteCardBaseId:favoriteCard ? favoriteParsed.baseId : '',
    favoriteCardVariant:favoriteCard ? favoriteParsed.variant : '',
    favoriteCardEnhancementKeyword,
    favoriteCardName:favoriteCard ? String(favoriteCard.name||favoriteParsed.baseId).slice(0,90) : '',
    cosmetics:normalizePublicProfileCosmetics(profile?.profileCosmetics),
    stats:safeStats,
    achievements,
    workshop:{
      machinesUnlocked:nonneg(safeStats.workshopMachinesUnlocked),
      enhancementsCrafted:nonneg(safeStats.enhancementsCrafted),
      cardsEvolved:nonneg(safeStats.cardsEvolved),
      industrialMixes:nonneg(safeStats.industrialMixes)
    }
  };
}

export async function getPublicPlayerProfile(db,{targetUid}={}) {
  const uid=cleanUid(targetUid);
  const [profileSnap,statsSnap,achievementsSnap]=await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`playerStats/${uid}`).get(),
    db.doc('gameConfig/achievements').get()
  ]);
  if(!profileSnap.exists) throw economyError('PUBLIC_PROFILE_NOT_FOUND');
  const rawProfile=profileSnap.data()||{};
  const snapshot=buildPublicPlayerProfile({
    uid,
    profile:rawProfile,
    stats:statsSnap.exists ? (statsSnap.data()||{}) : {},
    achievementsConfig:achievementsSnap.exists ? (achievementsSnap.data()||{}) : {}
  });
  // Fail-closed + self-healing: a stale favorite is never exposed and is cleared best-effort.
  if(String(rawProfile.favoriteCardId||'').trim() && !snapshot.favoriteCardId) {
    void db.doc(`users/${uid}`).update({favoriteCardId:''}).catch(()=>{});
  }
  return snapshot;
}

export async function setFavoriteCard(db,{uid,cardId}={}) {
  const ownerUid=cleanUid(uid);
  const requested=String(cardId||'').trim();
  const result=await db.runTransaction(async tx=>{
    const userRef=db.doc(`users/${ownerUid}`);
    const profileSnap=await tx.get(userRef);
    if(!profileSnap.exists) throw economyError('PROFILE_MISSING');
    const profile=profileSnap.data()||{};
    if(!requested) {
      tx.update(userRef,{favoriteCardId:''});
      return {favoriteCardId:''};
    }
    const parsed=parseFavoriteCardId(requested);
    if(!parsed.baseId||!TRUSTED_CARD_IDS.has(parsed.baseId)||!['base','enhanced'].includes(parsed.variant)) throw economyError('PUBLIC_PROFILE_FAVORITE_INVALID');
    const publication=await loadCardPublicationPolicy(db,tx);
    if(!cardEnabledByPolicy(parsed.baseId,publication)) throw economyError('CARD_DISABLED',{cardId:parsed.baseId});
    const validFavorite=favoriteCardIdIfOwned(profile,requested);
    if(validFavorite!==requested) throw economyError('PUBLIC_PROFILE_FAVORITE_NOT_OWNED',{cardId:requested});
    tx.update(userRef,{favoriteCardId:requested});
    return {favoriteCardId:requested};
  });
  return result;
}

export const PUBLIC_PROFILE_STAT_KEYS = PUBLIC_STAT_KEYS;
