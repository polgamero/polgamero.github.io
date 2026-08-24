// js/pvpRewards.js — Entrega 23.13.68
// Reglas PURAS de elegibilidad económica PvP. No toca Firebase ni DOM.

export const PVP_REWARD_DEFAULTS = Object.freeze({
  minRewardMinutes: 3,
  minCompletedTurns: 4,
  maxRewardedMatchesPerPairDaily: 5,
  maxPointsPerDay: 1200
});

function intAtLeast(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizePvpRewardLimits(config = {}) {
  return {
    minRewardMinutes: intAtLeast(config.pvpMinRewardMinutes, PVP_REWARD_DEFAULTS.minRewardMinutes, 0, 1440),
    minCompletedTurns: intAtLeast(config.pvpMinCompletedTurns, PVP_REWARD_DEFAULTS.minCompletedTurns, 0, 1000),
    maxRewardedMatchesPerPairDaily: intAtLeast(config.pvpMaxRewardedMatchesPerPairDaily, PVP_REWARD_DEFAULTS.maxRewardedMatchesPerPairDaily, 0, 1000),
    maxPointsPerDay: intAtLeast(config.pvpMaxPointsPerDay, PVP_REWARD_DEFAULTS.maxPointsPerDay, 0, 100000000)
  };
}

export function pvpCompletedTurns(turnCountAtEnd) {
  return Math.max(0, Math.floor(Number(turnCountAtEnd) || 1) - 1);
}

export function argentinaDayKeyFromMs(ms) {
  const value = Number(ms);
  const date = new Date(Number.isFinite(value) ? value : Date.now());
  const shifted = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function pvpPairKey(uidA, uidB) {
  return [String(uidA || ''), String(uidB || '')].sort().join('__');
}

export function evaluatePvpRewardEligibility({
  terminalKind,
  durationMs,
  turnCountAtEnd,
  pairAlreadyRewarded = false,
  pairRewardedCount = 0,
  dailyPointsAwarded = 0,
  requestedDelta = 0,
  limits = PVP_REWARD_DEFAULTS
} = {}) {
  const normalized = normalizePvpRewardLimits({
    pvpMinRewardMinutes: limits.minRewardMinutes,
    pvpMinCompletedTurns: limits.minCompletedTurns,
    pvpMaxRewardedMatchesPerPairDaily: limits.maxRewardedMatchesPerPairDaily,
    pvpMaxPointsPerDay: limits.maxPointsPerDay
  });
  const completedTurns = pvpCompletedTurns(turnCountAtEnd);
  const elapsedMs = Math.max(0, Math.floor(Number(durationMs) || 0));
  const requested = Math.max(0, Math.floor(Number(requestedDelta) || 0));
  const pairCount = Math.max(0, Math.floor(Number(pairRewardedCount) || 0));
  const dayPoints = Math.max(0, Math.floor(Number(dailyPointsAwarded) || 0));

  if (terminalKind === 'abandon') {
    const minMs = normalized.minRewardMinutes * 60000;
    if (elapsedMs < minMs || completedTurns < normalized.minCompletedTurns) {
      return {
        rewardable: false,
        reason: 'early_abandon',
        appliedDelta: 0,
        requestedDelta: requested,
        completedTurns,
        durationMs: elapsedMs,
        limits: normalized
      };
    }
  }

  if (!pairAlreadyRewarded && pairCount >= normalized.maxRewardedMatchesPerPairDaily) {
    return {
      rewardable: false,
      reason: 'pair_limit',
      appliedDelta: 0,
      requestedDelta: requested,
      completedTurns,
      durationMs: elapsedMs,
      limits: normalized
    };
  }

  const remaining = Math.max(0, normalized.maxPointsPerDay - dayPoints);
  const appliedDelta = Math.min(requested, remaining);
  if (appliedDelta <= 0) {
    return {
      rewardable: false,
      reason: 'daily_cap',
      appliedDelta: 0,
      requestedDelta: requested,
      completedTurns,
      durationMs: elapsedMs,
      limits: normalized
    };
  }

  return {
    rewardable: true,
    reason: appliedDelta < requested ? 'daily_cap_partial' : 'rewarded',
    appliedDelta,
    requestedDelta: requested,
    completedTurns,
    durationMs: elapsedMs,
    limits: normalized
  };
}
