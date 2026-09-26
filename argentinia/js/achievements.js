// HF23.3.13 — Mis Logros + Esencia client catalog/helpers.
export const ACHIEVEMENT_TIERS = Object.freeze(['copper','bronze','silver','gold','diamond']);
export const ACHIEVEMENT_TIER_ICONS = Object.freeze({ copper:'🥉', bronze:'🏆', silver:'🥈', gold:'🥇', diamond:'💎' });
const TIER_REWARDS = Object.freeze({
  copper:Object.freeze({points:50,fichas:0,essence:0}), bronze:Object.freeze({points:100,fichas:1,essence:0}),
  silver:Object.freeze({points:150,fichas:1,essence:1}), gold:Object.freeze({points:250,fichas:2,essence:2}),
  diamond:Object.freeze({points:400,fichas:3,essence:4})
});
export const ACHIEVEMENT_FAMILIES = Object.freeze([
  Object.freeze({id:'soloWins',metric:'soloWins',targets:Object.freeze([5,25,75,150,300])}),
  Object.freeze({id:'pvpWins',metric:'multiplayerWins',targets:Object.freeze([3,15,40,100,250])}),
  Object.freeze({id:'tournamentWins',metric:'tournamentChampionships',targets:Object.freeze([1,3,5,10,25])}),
  Object.freeze({id:'packsOpened',metric:'packsOpened',targets:Object.freeze([10,50,150,300,600])}),
  Object.freeze({id:'uniqueCards',metric:'uniqueCards',targets:Object.freeze([50,150,300,600,850])}),
  Object.freeze({id:'mythicCards',metric:'mythicCardsOwned',targets:Object.freeze([1,5,15,30,60])}),
  Object.freeze({id:'enhancements',metric:'enhancementsCrafted',targets:Object.freeze([1,3,10,25,50])}),
  Object.freeze({id:'trades',metric:'tradesCompleted',targets:Object.freeze([1,5,15,35,75])}),
  Object.freeze({id:'classifieds',metric:'classifiedsCardsPurchased',targets:Object.freeze([3,10,25,60,120])}),
  Object.freeze({id:'gamesPlayed',metric:'gamesPlayed',targets:Object.freeze([10,50,150,400,1000])})
]);
export const achievementId=(familyId,tier)=>`${String(familyId||'')}_${String(tier||'')}`;
export const ACHIEVEMENT_TROPHY_ASSET_DIR = './assets/images/logros';
export const achievementTrophyFilename=(familyId,tier)=>`${achievementId(familyId,tier)}.png`;
export const achievementTrophyPath=(familyId,tier)=>`${ACHIEVEMENT_TROPHY_ASSET_DIR}/${achievementTrophyFilename(familyId,tier)}`;
const nonneg=v=>Math.max(0,Math.floor(Number(v)||0));
export function defaultAchievementEntries(){const out={};for(const family of ACHIEVEMENT_FAMILIES)ACHIEVEMENT_TIERS.forEach((tier,index)=>{const reward=TIER_REWARDS[tier],id=achievementId(family.id,tier);out[id]={id,familyId:family.id,metric:family.metric,tier,enabled:true,target:family.targets[index],points:reward.points,fichas:reward.fichas,essence:reward.essence};});return out;}
export function normalizeAchievementsConfig(raw={}){const defaults=defaultAchievementEntries(),source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},rows=source.entries&&typeof source.entries==='object'&&!Array.isArray(source.entries)?source.entries:{};const entries={};for(const[id,fallback]of Object.entries(defaults)){const row=rows[id]&&typeof rows[id]==='object'&&!Array.isArray(rows[id])?rows[id]:{};entries[id]={...fallback,enabled:typeof row.enabled==='boolean'?row.enabled:fallback.enabled,target:Math.max(1,nonneg(row.target||fallback.target)),points:nonneg(row.points??fallback.points),fichas:nonneg(row.fichas??fallback.fichas),essence:nonneg(row.essence??fallback.essence)};}return{schemaVersion:1,enabled:typeof source.enabled==='boolean'?source.enabled:true,entries};}
export function normalizeAchievementProfile(raw={}){const source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},claimed=source.claimed&&typeof source.claimed==='object'&&!Array.isArray(source.claimed)?source.claimed:{},notified=source.notified&&typeof source.notified==='object'&&!Array.isArray(source.notified)?source.notified:{};return{schemaVersion:1,claimed:{...claimed},notified:{...notified}};}
export function achievementMetricValue({profile={},stats={},metric='',cardLookup=null}={}){if(metric==='mythicCardsOwned'){const ids=new Set();for(const id of Array.isArray(profile.collection)?profile.collection:[]){const card=typeof cardLookup==='function'?cardLookup(String(id)):null;if(String(card?.rarity||'').toLowerCase()==='mythic')ids.add(String(id));}return ids.size;}return nonneg(stats?.[metric]);}
export function achievementRows(configRaw={}){const config=normalizeAchievementsConfig(configRaw);return ACHIEVEMENT_FAMILIES.map(family=>({family,...ACHIEVEMENT_TIERS.map(tier=>config.entries[achievementId(family.id,tier)])}));}
