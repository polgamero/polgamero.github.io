// HF23.3.13 — Mis Logros + Esencia server authority.
// Achievement progress is derived only from trusted/server-owned profile + playerStats.
import { TRUSTED_CARD_POOL } from '../trusted/cardCatalog.js';
import { economyError } from '../shared/errors.js';

export const ACHIEVEMENT_TIERS = Object.freeze(['copper','bronze','silver','gold','diamond']);
const TIER_REWARDS = Object.freeze({
  copper: Object.freeze({ points:50, fichas:0, essence:0 }),
  bronze: Object.freeze({ points:100, fichas:1, essence:0 }),
  silver: Object.freeze({ points:150, fichas:1, essence:1 }),
  gold: Object.freeze({ points:250, fichas:2, essence:2 }),
  diamond: Object.freeze({ points:400, fichas:3, essence:4 })
});

export const ACHIEVEMENT_FAMILIES = Object.freeze([
  Object.freeze({ id:'soloWins', metric:'soloWins', targets:Object.freeze([5,25,75,150,300]) }),
  Object.freeze({ id:'pvpWins', metric:'multiplayerWins', targets:Object.freeze([3,15,40,100,250]) }),
  Object.freeze({ id:'tournamentWins', metric:'tournamentChampionships', targets:Object.freeze([1,3,5,10,25]) }),
  Object.freeze({ id:'packsOpened', metric:'packsOpened', targets:Object.freeze([10,50,150,300,600]) }),
  Object.freeze({ id:'uniqueCards', metric:'uniqueCards', targets:Object.freeze([50,150,300,600,850]) }),
  Object.freeze({ id:'mythicCards', metric:'mythicCardsOwned', targets:Object.freeze([1,5,15,30,60]) }),
  Object.freeze({ id:'enhancements', metric:'enhancementsCrafted', targets:Object.freeze([1,3,10,25,50]) }),
  Object.freeze({ id:'trades', metric:'tradesCompleted', targets:Object.freeze([1,5,15,35,75]) }),
  Object.freeze({ id:'classifieds', metric:'classifiedsCardsPurchased', targets:Object.freeze([3,10,25,60,120]) }),
  Object.freeze({ id:'gamesPlayed', metric:'gamesPlayed', targets:Object.freeze([10,50,150,400,1000]) })
]);

const familyById = new Map(ACHIEVEMENT_FAMILIES.map(row => [row.id,row]));
const mythicIds = new Set(TRUSTED_CARD_POOL.filter(card => String(card?.rarity || '').toLowerCase() === 'mythic').map(card => String(card.id)));
const nonneg = value => Math.max(0, Math.floor(Number(value) || 0));
const enabled = (value, fallback=true) => typeof value === 'boolean' ? value : fallback;

export function achievementId(familyId, tier) {
  return `${String(familyId || '')}_${String(tier || '')}`;
}

export function defaultAchievementEntries() {
  const entries = {};
  for (const family of ACHIEVEMENT_FAMILIES) {
    ACHIEVEMENT_TIERS.forEach((tier,index) => {
      const id=achievementId(family.id,tier), reward=TIER_REWARDS[tier];
      entries[id]={
        id, familyId:family.id, metric:family.metric, tier,
        enabled:true, target:family.targets[index],
        points:reward.points, fichas:reward.fichas, essence:reward.essence
      };
    });
  }
  return entries;
}

export function normalizeAchievementsConfig(raw = {}) {
  const defaults=defaultAchievementEntries();
  const source=raw && typeof raw==='object' && !Array.isArray(raw) ? raw : {};
  const rows=source.entries && typeof source.entries==='object' && !Array.isArray(source.entries) ? source.entries : {};
  const entries={};
  for(const [id,fallback] of Object.entries(defaults)){
    const row=rows[id] && typeof rows[id]==='object' && !Array.isArray(rows[id]) ? rows[id] : {};
    entries[id]={
      ...fallback,
      enabled:enabled(row.enabled,fallback.enabled),
      target:Math.max(1,nonneg(row.target || fallback.target)),
      points:nonneg(row.points ?? fallback.points),
      fichas:nonneg(row.fichas ?? fallback.fichas),
      essence:nonneg(row.essence ?? fallback.essence)
    };
  }
  return { schemaVersion:1, enabled:enabled(source.enabled,true), entries };
}

export function normalizeAchievementProfile(raw = {}) {
  const source=raw && typeof raw==='object' && !Array.isArray(raw) ? raw : {};
  const claimed=source.claimed && typeof source.claimed==='object' && !Array.isArray(source.claimed) ? source.claimed : {};
  const safe={};
  for(const [id,value] of Object.entries(claimed)) if(defaultAchievementEntries()[id] && value) safe[id]=nonneg(value) || 1;
  return { schemaVersion:1, claimed:safe };
}

export function achievementMetricValue({ profile={}, stats={}, metric='' } = {}) {
  if(metric==='mythicCardsOwned'){
    const collection=Array.isArray(profile.collection)?profile.collection:[];
    return new Set(collection.map(String).filter(id=>mythicIds.has(id))).size;
  }
  return nonneg(stats?.[metric]);
}

export async function claimAchievementTx({ db, tx, uid, achievementId:rawId }) {
  const id=String(rawId||'').trim();
  const defaults=defaultAchievementEntries();
  if(!defaults[id]) throw economyError('ACHIEVEMENT_INVALID');
  const userRef=db.collection('users').doc(uid), statsRef=db.collection('playerStats').doc(uid), configRef=db.doc('gameConfig/achievements');
  const [userSnap,statsSnap,configSnap]=await Promise.all([tx.get(userRef),tx.get(statsRef),tx.get(configRef)]);
  if(!userSnap.exists) throw economyError('PROFILE_MISSING');
  const profile=userSnap.data()||{}, stats=statsSnap.exists?(statsSnap.data()||{}):{};
  const config=normalizeAchievementsConfig(configSnap.exists?(configSnap.data()||{}):{});
  if(!config.enabled) throw economyError('ACHIEVEMENTS_DISABLED');
  const row=config.entries[id];
  if(!row?.enabled) throw economyError('ACHIEVEMENT_DISABLED');
  const state=normalizeAchievementProfile(profile.achievements);
  if(state.claimed[id]) throw economyError('ACHIEVEMENT_ALREADY_CLAIMED');
  const progress=achievementMetricValue({profile,stats,metric:row.metric});
  if(progress<row.target) throw economyError('ACHIEVEMENT_NOT_REACHED',{ progress, target:row.target });
  const pointsBefore=nonneg(profile.points), fichasBefore=nonneg(profile.fichas), essenceBefore=nonneg(profile.essence);
  const pointsAfter=pointsBefore+row.points, fichasAfter=fichasBefore+row.fichas, essenceAfter=essenceBefore+row.essence;
  const nextAchievements={...state,claimed:{...state.claimed,[id]:Date.now()}};
  tx.update(userRef,{points:pointsAfter,fichas:fichasAfter,essence:essenceAfter,achievements:nextAchievements});
  return {
    kind:'achievementClaim', achievementId:id, familyId:row.familyId, tier:row.tier,
    progress, target:row.target, pointsGain:row.points, fichasGain:row.fichas, essenceGain:row.essence,
    pointsAfter,fichasAfter,essenceAfter
  };
}

export function achievementCatalogSnapshot(rawConfig={}) {
  const config=normalizeAchievementsConfig(rawConfig);
  return { schemaVersion:1, enabled:config.enabled, entries:Object.values(config.entries) };
}
