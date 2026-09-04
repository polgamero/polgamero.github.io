// v23.19.5.4 — pure match reward + PvP anti-farming rules for server authority.
export const PVP_REWARD_DEFAULTS = Object.freeze({
  minRewardMinutes:3,
  minCompletedTurns:4,
  maxRewardedMatchesPerPairDaily:5,
  maxPointsPerDay:1200
});

function intAtLeast(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
export function normalizePvpRewardLimits(config = {}) {
  return {
    minRewardMinutes:intAtLeast(config.pvpMinRewardMinutes,PVP_REWARD_DEFAULTS.minRewardMinutes,0,1440),
    minCompletedTurns:intAtLeast(config.pvpMinCompletedTurns,PVP_REWARD_DEFAULTS.minCompletedTurns,0,1000),
    maxRewardedMatchesPerPairDaily:intAtLeast(config.pvpMaxRewardedMatchesPerPairDaily,PVP_REWARD_DEFAULTS.maxRewardedMatchesPerPairDaily,0,1000),
    maxPointsPerDay:intAtLeast(config.pvpMaxPointsPerDay,PVP_REWARD_DEFAULTS.maxPointsPerDay,0,100000000)
  };
}
export function normalizeMatchRewardConfig(settings = {}) {
  const intOr=(value,fallback,{signed=false}={})=>{
    const n=Number(value); if(!Number.isFinite(n)) return fallback;
    const x=Math.floor(n); return signed?x:Math.max(0,x);
  };
  const hasMedium=Number.isFinite(Number(settings?.winVsTanoMedio));
  const hasLegacyHard=Number.isFinite(Number(settings?.winVsTanoDificil));
  return {
    solo:{
      easy:intOr(settings?.winVsTanoFacil,50),
      medium:hasMedium?intOr(settings.winVsTanoMedio,100):(hasLegacyHard?intOr(settings.winVsTanoDificil,100):100),
      hard:hasMedium&&hasLegacyHard?intOr(settings.winVsTanoDificil,200):200,
      loss:intOr(settings?.lossVsTano,15)
    },
    pvp:{ win:intOr(settings?.winVsHumano,120), loss:intOr(settings?.lossVsHumano,20) },
    abandonPenalty:intOr(settings?.abandonPenalty,-30,{signed:true}),
    limits:normalizePvpRewardLimits(settings)
  };
}
export function pvpCompletedTurns(turnCountAtEnd){return Math.max(0,Math.floor(Number(turnCountAtEnd)||1)-1);}
export function normalizeAbandonDurationMs(value){return Math.min(24*60*60*1000,Math.max(0,Math.floor(Number(value)||0)));}
export function deriveSoloAbandonReceiptId(operationId,uid){
  const op=String(operationId||''),prefix='abandon:solo:',suffix=`:${String(uid||'')}`;
  if(!op.startsWith(prefix)||!op.endsWith(suffix)) return '';
  return String(op.slice(prefix.length,op.length-suffix.length)||'').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,240);
}
export function argentinaMatchDayKey(ms=Date.now()){
  const shifted=new Date(Number(ms)-3*60*60*1000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth()+1).padStart(2,'0')}-${String(shifted.getUTCDate()).padStart(2,'0')}`;
}
export function pvpPairKey(a,b){return [String(a||''),String(b||'')].sort().join('__');}
export function evaluatePvpRewardEligibility({terminalKind,durationMs,turnCountAtEnd,pairAlreadyRewarded=false,pairRewardedCount=0,dailyPointsAwarded=0,requestedDelta=0,limits=PVP_REWARD_DEFAULTS}={}){
  const normalized=normalizePvpRewardLimits({
    pvpMinRewardMinutes:limits.minRewardMinutes,pvpMinCompletedTurns:limits.minCompletedTurns,
    pvpMaxRewardedMatchesPerPairDaily:limits.maxRewardedMatchesPerPairDaily,pvpMaxPointsPerDay:limits.maxPointsPerDay
  });
  const completedTurns=pvpCompletedTurns(turnCountAtEnd), elapsedMs=Math.max(0,Math.floor(Number(durationMs)||0)), requested=Math.max(0,Math.floor(Number(requestedDelta)||0));
  const pairCount=Math.max(0,Math.floor(Number(pairRewardedCount)||0)), dayPoints=Math.max(0,Math.floor(Number(dailyPointsAwarded)||0));
  if(terminalKind==='abandon'){
    if(elapsedMs<normalized.minRewardMinutes*60000||completedTurns<normalized.minCompletedTurns) return {rewardable:false,reason:'early_abandon',appliedDelta:0,requestedDelta:requested,completedTurns,durationMs:elapsedMs,limits:normalized};
  }
  if(!pairAlreadyRewarded&&pairCount>=normalized.maxRewardedMatchesPerPairDaily) return {rewardable:false,reason:'pair_limit',appliedDelta:0,requestedDelta:requested,completedTurns,durationMs:elapsedMs,limits:normalized};
  const remaining=Math.max(0,normalized.maxPointsPerDay-dayPoints), appliedDelta=Math.min(requested,remaining);
  if(appliedDelta<=0) return {rewardable:false,reason:'daily_cap',appliedDelta:0,requestedDelta:requested,completedTurns,durationMs:elapsedMs,limits:normalized};
  return {rewardable:true,reason:appliedDelta<requested?'daily_cap_partial':'rewarded',appliedDelta,requestedDelta:requested,completedTurns,durationMs:elapsedMs,limits:normalized};
}
export function deriveTerminalOutcome(match={}){
  const hostDead=Number(match.hostHP)<=0||Number(match.hostPoison||0)>=10||(match.gameOver===true&&match.phase==='draw'&&match.activePlayer==='host'&&Number(match.hostDeckCount||0)<=0);
  const guestDead=Number(match.guestHP)<=0||Number(match.guestPoison||0)>=10||(match.gameOver===true&&match.phase==='draw'&&match.activePlayer==='guest'&&Number(match.guestDeckCount||0)<=0);
  if(match.abandonedBy==='host'||match.abandonedBy==='guest') return {terminalKind:'abandon',loserRole:match.abandonedBy,winnerRole:match.abandonedBy==='host'?'guest':'host'};
  if(hostDead!==guestDead) return hostDead?{terminalKind:'natural',loserRole:'host',winnerRole:'guest'}:{terminalKind:'natural',loserRole:'guest',winnerRole:'host'};
  return null;
}
export function normalizeMatchCampaignEffects(events=[],nowMs=Date.now()){
  let allPointsMultiplier=1; const activeEventIds=[];
  for(const event of events||[]){
    const start=event?.startAt?.toMillis?.()??new Date(event?.startAt||0).getTime();
    const end=event?.endAt?.toMillis?.()??new Date(event?.endAt||0).getTime();
    if(!(start<=nowMs&&nowMs<end)) continue;
    if(event.type!=='all_points_multiplier') continue;
    const value=Math.max(1,Math.min(10,Number(event.value)||1));
    allPointsMultiplier=Math.max(allPointsMultiplier,value); activeEventIds.push(String(event.id||''));
  }
  return { allPointsMultiplier, activeEventIds:activeEventIds.filter(Boolean) };
}
export function effectiveMatchRewardPoints(baseDelta,effects={}){return Math.max(0,Math.floor((Math.max(0,Math.floor(Number(baseDelta)||0)))*(Math.max(1,Number(effects.allPointsMultiplier)||1))));}
