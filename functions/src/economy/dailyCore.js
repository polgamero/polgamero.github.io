// v23.19.5.3 — pure Daily Rewards authority contracts.
// Server owns calendar progression and reward amounts; browser schedule is display-only.

export const DAILY_REWARDS_SCHEMA_VERSION = 4;
export const DAILY_TIMEZONE_OFFSET_MINUTES = -180; // ART / UTC-3

export const DAILY_REWARD_SCHEDULE = Object.freeze([
  Object.freeze({ day: 1, rewards: Object.freeze([Object.freeze({ type: 'points', amount: 30 })]) }),
  Object.freeze({ day: 2, rewards: Object.freeze([Object.freeze({ type: 'points', amount: 30 })]) }),
  Object.freeze({ day: 3, rewards: Object.freeze([Object.freeze({ type: 'points', amount: 30 })]) }),
  Object.freeze({ day: 4, rewards: Object.freeze([Object.freeze({ type: 'fichas', amount: 1 })]) }),
  Object.freeze({ day: 5, rewards: Object.freeze([Object.freeze({ type: 'points', amount: 60 })]) }),
  Object.freeze({ day: 6, rewards: Object.freeze([
    Object.freeze({ type: 'standardPack', amount: 1 }),
    Object.freeze({ type: 'points', amount: 100 })
  ]) }),
  Object.freeze({ day: 7, rewards: Object.freeze([Object.freeze({ type: 'guaranteedMythic', amount: 1 })]) })
]);

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof value?.toMillis === 'function') {
    const d = new Date(value.toMillis());
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value?.seconds === 'number') {
    const d = new Date(value.seconds * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1e6));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function pad2(n) { return String(n).padStart(2, '0'); }
function shifted(date) { return new Date(date.getTime() + DAILY_TIMEZONE_OFFSET_MINUTES * 60_000); }
export function dailyDateKey(date = new Date()) {
  const d = shifted(date instanceof Date ? date : new Date(date));
  if (Number.isNaN(d.getTime())) throw new Error('INVALID_DAILY_DATE');
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}`;
}
function keyMs(key) {
  const [y,m,d] = String(key || '').split('-').map(Number);
  return y && m && d ? Date.UTC(y,m-1,d) : NaN;
}
export function dailyDayDiff(fromKey, toKey) {
  const a=keyMs(fromKey), b=keyMs(toKey);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b-a)/86_400_000) : NaN;
}
export function dailyKeyStamp(key) {
  const ms=keyMs(key);
  return Number.isFinite(ms) ? new Date(ms) : null;
}
function keyFromTimestamp(value) {
  const d=toDate(value);
  return d ? `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}` : null;
}
function cleanDayList(value) {
  return Array.isArray(value) ? [...new Set(value.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=7))].sort((a,b)=>a-b) : [];
}
export function defaultDailyState() {
  return { cycleStartDate:null,lastLoginDate:null,previousLoginDate:null,streak:0,unlockedDays:[],claimedDays:[],lastClaimedDay:null,schemaVersion:0 };
}
export function normalizeDailyState(raw) {
  if (!raw || typeof raw !== 'object') return defaultDailyState();
  const cycle=keyFromTimestamp(raw.serverCycleStartDay) || (typeof raw.cycleStartDate==='string'?raw.cycleStartDate:null);
  const last=keyFromTimestamp(raw.serverLastLoginDay) || (typeof raw.lastLoginDate==='string'?raw.lastLoginDate:null);
  const prev=keyFromTimestamp(raw.serverPreviousLoginDay) || (typeof raw.previousLoginDate==='string'?raw.previousLoginDate:null);
  const claimed=cleanDayList(raw.claimedDays);
  return {
    cycleStartDate:cycle,lastLoginDate:last,previousLoginDate:prev,
    streak:Math.max(0,Math.min(7,Math.floor(Number(raw.streak)||0))),
    unlockedDays:cleanDayList(raw.unlockedDays),claimedDays:claimed,
    lastClaimedDay: raw.lastClaimedDay == null ? null : (Number.isInteger(Number(raw.lastClaimedDay)) ? Number(raw.lastClaimedDay) : null),
    schemaVersion:Math.max(0,Math.floor(Number(raw.schemaVersion)||0))
  };
}
export function hasTrustedContinuity(raw) {
  if (!(raw && typeof raw === 'object') || Number(raw.schemaVersion) < DAILY_REWARDS_SCHEMA_VERSION) return false;
  const state=normalizeDailyState(raw);
  if (!state.cycleStartDate || !state.lastLoginDate) return false;
  return state.streak <= 1 || !!state.previousLoginDate;
}
export function isDailyStateConsistent(raw) {
  const state=normalizeDailyState(raw);
  if (!state.lastLoginDate && state.streak===0) return true;
  if (!state.cycleStartDate || !state.lastLoginDate || state.streak<1 || state.streak>7) return false;
  if (dailyDayDiff(state.cycleStartDate,state.lastLoginDate)!==state.streak-1) return false;
  if (state.streak===1 && state.previousLoginDate) return false;
  if (state.streak>1 && dailyDayDiff(state.previousLoginDate,state.lastLoginDate)!==1) return false;
  const expected=Array.from({length:state.streak},(_,i)=>i+1);
  if (state.unlockedDays.length!==expected.length || !state.unlockedDays.every((v,i)=>v===expected[i])) return false;
  if (state.claimedDays.some(day=>!state.unlockedDays.includes(day))) return false;
  if (state.lastClaimedDay!=null && !state.claimedDays.includes(state.lastClaimedDay)) return false;
  return true;
}
export function advanceDailyState(raw, now = new Date()) {
  const today=dailyDateKey(now);
  const trusted=hasTrustedContinuity(raw) ? raw : null;
  const state=normalizeDailyState(trusted);
  const legacyMigration=!!raw && Number(raw.schemaVersion)>0 && Number(raw.schemaVersion)<DAILY_REWARDS_SCHEMA_VERSION;
  const inconsistent=!!state.lastLoginDate && !isDailyStateConsistent(trusted);
  if (state.lastLoginDate===today && !inconsistent) {
    return { state,newCalendarLogin:false,rewardDay:null,rewardUnlocked:false,streakReset:false,cycleRestarted:false,cycleCompleted:false,repairApplied:false,legacyMigration };
  }
  if (inconsistent) {
    const repaired={...defaultDailyState(),cycleStartDate:today,lastLoginDate:today,streak:1,unlockedDays:[1]};
    return { state:repaired,newCalendarLogin:true,rewardDay:1,rewardUnlocked:true,streakReset:true,cycleRestarted:true,cycleCompleted:false,repairApplied:true,legacyMigration };
  }
  const diff=state.lastLoginDate ? dailyDayDiff(state.lastLoginDate,today) : NaN;
  const consecutive=diff===1;
  if (state.lastLoginDate && consecutive && state.streak>=1 && state.streak<7) {
    const streak=state.streak+1;
    const next={...state,cycleStartDate:state.cycleStartDate||state.lastLoginDate,previousLoginDate:state.lastLoginDate,lastLoginDate:today,streak,unlockedDays:Array.from({length:streak},(_,i)=>i+1)};
    return { state:next,newCalendarLogin:true,rewardDay:streak,rewardUnlocked:true,streakReset:false,cycleRestarted:false,cycleCompleted:false,repairApplied:false,legacyMigration };
  }
  const cycleCompleted=!!state.lastLoginDate && consecutive && state.streak>=7;
  const streakReset=!!state.lastLoginDate && !consecutive;
  const next={...defaultDailyState(),cycleStartDate:today,lastLoginDate:today,streak:1,unlockedDays:[1]};
  return { state:next,newCalendarLogin:true,rewardDay:1,rewardUnlocked:true,streakReset,cycleRestarted:!!state.lastLoginDate,cycleCompleted,repairApplied:false,legacyMigration };
}
export function dailyRewardForDay(day) { return DAILY_REWARD_SCHEDULE.find(entry=>entry.day===Number(day)) || null; }
export function dailyRewardClaimable(raw, day) {
  const state=normalizeDailyState(raw); const n=Number(day);
  return state.unlockedDays.includes(n) && !state.claimedDays.includes(n) && !!dailyRewardForDay(n);
}
export function serializeDailyState(state, serverNow) {
  const normalized=normalizeDailyState(state);
  return {
    schemaVersion:DAILY_REWARDS_SCHEMA_VERSION,
    serverCycleStartDay:dailyKeyStamp(normalized.cycleStartDate),
    serverPreviousLoginDay:dailyKeyStamp(normalized.previousLoginDate),
    serverLastLoginDay:dailyKeyStamp(normalized.lastLoginDate),
    serverUpdatedAt:new Date(serverNow),
    streak:normalized.streak,
    unlockedDays:[...normalized.unlockedDays],
    claimedDays:[...normalized.claimedDays],
    lastClaimedDay:normalized.lastClaimedDay==null?null:Number(normalized.lastClaimedDay)
  };
}
function timestampMs(value) {
  const d=toDate(value); return d ? d.getTime() : 0;
}
function eventActive(event,nowMs){
  if(!event || event.finalizedAt || event.finalized===true) return false;
  const start=timestampMs(event.startAt), end=timestampMs(event.endAt);
  return !(start && nowMs<start) && !(end && nowMs>=end);
}
export function buildDailyCampaignEffects(events=[],nowMs=Date.now()) {
  let allPointsMultiplier=1, allFichasMultiplier=1;
  const activeEventIds=[];
  for(const event of Array.isArray(events)?events:[]){
    if(!eventActive(event,nowMs)) continue;
    const value=Math.max(0,Number(event.value)||0);
    if(event.type==='all_points_multiplier') { allPointsMultiplier=Math.max(allPointsMultiplier,value||1); activeEventIds.push(String(event.id||'')); }
    if(event.type==='all_fichas_multiplier') { allFichasMultiplier=Math.max(allFichasMultiplier,value||1); activeEventIds.push(String(event.id||'')); }
  }
  return {allPointsMultiplier,allFichasMultiplier,activeEventIds:[...new Set(activeEventIds.filter(Boolean))].slice(0,32)};
}
export function effectiveDailyRewards(entry,effects={}) {
  if(!entry) throw new Error('INVALID_DAILY_REWARD');
  const pointsMult=Math.max(1,Number(effects.allPointsMultiplier)||1);
  const fichasMult=Math.max(1,Number(effects.allFichasMultiplier)||1);
  return (entry.rewards||[]).map(item=>{
    const base=Math.max(0,Math.floor(Number(item.amount)||0));
    if(item.type==='points') return {...item,amount:Math.round(base*pointsMult)};
    if(item.type==='fichas') return {...item,amount:Math.round(base*fichasMult)};
    return {...item,amount:base};
  });
}
export function dailyRewardTotals(rewards=[]) {
  return rewards.reduce((acc,item)=>{
    const amount=Math.max(0,Math.floor(Number(item?.amount)||0));
    if(item?.type==='points') acc.points+=amount;
    else if(item?.type==='fichas') acc.fichas+=amount;
    else if(item?.type==='standardPack') acc.standardPacks+=amount;
    else if(item?.type==='guaranteedMythic') acc.guaranteedMythics+=amount;
    return acc;
  },{points:0,fichas:0,standardPacks:0,guaranteedMythics:0});
}
