// js/statistics.js — Entrega 23.13.37
// Capa pura para métricas, ranking y agregación de telemetría. Sin Firebase ni DOM.

export const PLAYER_STATS_SCHEMA_VERSION = 1;
export const PLAYER_STATS_TRACKING_VERSION = '23.13.37';
export const PLAYER_GAME_BACKFILL_VERSION = 1;

export function emptyPlayerStats() {
  return {
    schemaVersion: PLAYER_STATS_SCHEMA_VERSION,
    trackingSinceVersion: PLAYER_STATS_TRACKING_VERSION,
    gameBackfillVersion: 0,
    gamesPlayed: 0,
    soloGames: 0,
    multiplayerGames: 0,
    wins: 0,
    losses: 0,
    soloWins: 0,
    soloLosses: 0,
    multiplayerWins: 0,
    multiplayerLosses: 0,
    abandons: 0,
    totalDurationMs: 0,
    pointsEarned: 0,
    pointsSpent: 0,
    pointsLost: 0,
    fichasEarned: 0,
    fichasSpent: 0,
    packsReceived: 0,
    packsOpened: 0,
    guaranteedMythicsOpened: 0
  };
}

function int0(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function normalizePlayerStats(value) {
  const base = emptyPlayerStats();
  const src = value && typeof value === 'object' ? value : {};
  for (const key of Object.keys(base)) {
    if (typeof base[key] === 'number') base[key] = int0(src[key]);
    else if (typeof src[key] === 'string' && src[key]) base[key] = src[key];
  }
  base.schemaVersion = PLAYER_STATS_SCHEMA_VERSION;
  base.gameBackfillVersion = int0(src.gameBackfillVersion);
  return base;
}

export function telemetryDurationMs(session) {
  const effective = Number(session?.effectiveDurationMs);
  if (Number.isFinite(effective) && effective >= 0) return Math.floor(effective);
  const start = Date.parse(session?.startedAtClient || session?.startedAt || session?.meta?.startedAt || '');
  const end = Date.parse(session?.endedAtClient || session?.endedAt || '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.max(0, end - start);
}

export function isTelemetryTerminalGame(session) {
  const status = String(session?.status || 'running');
  return (status === 'completed' || status === 'ended_unfinalized') && !!(session?.endedAtClient || session?.endedAt);
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

export function telemetryOutcome(session) {
  const endReason = String(session?.endReason || '');
  if (endReason === 'abandon_local' || endReason.startsWith('abandon_recovery')) return { result: 'loss', abandoned: true };
  const snap = parseJson(session?.latestSnapshotJson, session?.finalSnapshot || null);
  const turn = snap?.turn || {};
  if (turn.abandonedBy === 'rival') return { result: 'win', abandoned: false };
  if (turn.abandonedBy === 'local') return { result: 'loss', abandoned: true };
  const local = snap?.local || {};
  const rival = snap?.rival || {};
  if ((Number(local.hp) || 0) <= 0 || (Number(local.poison) || 0) >= 10) return { result: 'loss', abandoned: false };
  if ((Number(rival.hp) || 0) <= 0 || (Number(rival.poison) || 0) >= 10) return { result: 'win', abandoned: false };
  return { result: 'unknown', abandoned: false };
}

export function summarizePlayerTelemetry(sessions = []) {
  const out = emptyPlayerStats();
  out.gameBackfillVersion = PLAYER_GAME_BACKFILL_VERSION;
  for (const session of sessions) {
    if (!session || !isTelemetryTerminalGame(session)) continue;
    const meta = parseJson(session.metaJson, session.meta || {}) || {};
    const modeRaw = String(session.mode || meta.mode || '').toLowerCase();
    const isMulti = modeRaw.startsWith('multi');
    const duration = telemetryDurationMs(session);
    const outcome = telemetryOutcome(session);
    out.gamesPlayed += 1;
    out.totalDurationMs += duration;
    if (isMulti) out.multiplayerGames += 1; else out.soloGames += 1;
    if (outcome.result === 'win') {
      out.wins += 1;
      if (isMulti) out.multiplayerWins += 1; else out.soloWins += 1;
    } else if (outcome.result === 'loss') {
      out.losses += 1;
      if (isMulti) out.multiplayerLosses += 1; else out.soloLosses += 1;
    }
    if (outcome.abandoned) out.abandons += 1;
  }
  return out;
}

export function summarizeGlobalTelemetry(sessions = []) {
  const completed = sessions.filter(isTelemetryTerminalGame);
  const soloGames = [];
  const multiGroups = new Map();
  for (const s of completed) {
    const meta = parseJson(s.metaJson, s.meta || {}) || {};
    const mode = String(s.mode || meta.mode || '').toLowerCase();
    if (mode.startsWith('multi')) {
      const key = String(s.matchId || meta.matchId || s.id || s.sessionId || 'unknown');
      if (!multiGroups.has(key)) multiGroups.set(key, []);
      multiGroups.get(key).push(s);
    } else {
      const soloKey = String(s.soloGameId || meta.soloGameId || s.id || s.sessionId || 'unknown');
      let group = soloGames.find(entry => entry.key === soloKey);
      if (!group) { group = { key: soloKey, sessions: [] }; soloGames.push(group); }
      group.sessions.push(s);
    }
  }
  const gameGroups = [...soloGames.map(entry => entry.sessions), ...multiGroups.values()];
  let totalDurationMs = 0;
  let abandonedGames = 0;
  let longestDurationMs = 0;
  for (const group of gameGroups) {
    const starts = group.map(s => Date.parse(s.startedAtClient || s.startedAt || '')).filter(Number.isFinite);
    const ends = group.map(s => Date.parse(s.endedAtClient || s.endedAt || '')).filter(Number.isFinite);
    const effectiveDurations = group.map(s => Number(s?.effectiveDurationMs)).filter(v => Number.isFinite(v) && v >= 0);
    let duration = effectiveDurations.length ? Math.max(...effectiveDurations) : 0;
    if (!effectiveDurations.length && starts.length && ends.length) duration = Math.max(0, Math.max(...ends) - Math.min(...starts));
    if (!duration) duration = Math.max(0, ...group.map(telemetryDurationMs));
    totalDurationMs += duration;
    longestDurationMs = Math.max(longestDurationMs, duration);
    if (group.some(s => String(s.endReason || '').includes('abandon'))) abandonedGames += 1;
  }
  const totalGames = gameGroups.length;
  return {
    totalGames,
    soloGames: soloGames.length,
    multiplayerGames: multiGroups.size,
    totalDurationMs,
    averageDurationMs: totalGames ? Math.round(totalDurationMs / totalGames) : 0,
    longestDurationMs,
    abandonedGames,
    completedSessions: completed.length
  };
}

export function summarizeProfiles(profiles = []) {
  const now = Date.now();
  const result = {
    registeredPlayers: profiles.length,
    new7d: 0,
    new30d: 0,
    active24h: 0,
    active7d: 0,
    active30d: 0,
    pointsInCirculation: 0,
    fichasInCirculation: 0,
    packsInChests: 0,
    cardsOwned: 0,
    uniqueCardDiscoveriesTotal: 0,
    communityUniqueCards: 0,
    averageUniqueCards: 0
  };
  const communityIds = new Set();
  for (const p of profiles) {
    const created = p?.createdAt?.toMillis?.() ?? Date.parse(p?.createdAt || '');
    if (Number.isFinite(created)) {
      const age = now - created;
      if (age <= 7 * 86400000) result.new7d++;
      if (age <= 30 * 86400000) result.new30d++;
    }
    const seen = p?.lastSeenAt?.toMillis?.() ?? Date.parse(p?.lastSeenAt || '');
    if (Number.isFinite(seen)) {
      const age = now - seen;
      if (age <= 86400000) result.active24h++;
      if (age <= 7 * 86400000) result.active7d++;
      if (age <= 30 * 86400000) result.active30d++;
    }
    result.pointsInCirculation += int0(p?.points);
    result.fichasInCirculation += int0(p?.fichas);
    result.packsInChests += int0(p?.inventory?.standardPacks);
    const collection = Array.isArray(p?.collection) ? p.collection : [];
    result.cardsOwned += collection.length;
    const unique = new Set(collection);
    result.uniqueCardDiscoveriesTotal += unique.size;
    unique.forEach(id => communityIds.add(id));
  }
  result.communityUniqueCards = communityIds.size;
  result.averageUniqueCards = profiles.length ? result.uniqueCardDiscoveriesTotal / profiles.length : 0;
  return result;
}

export function formatDuration(ms, { compact = true } = {}) {
  ms = int0(ms);
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (compact) {
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  }
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

export function winRate(stats) {
  const games = int0(stats?.wins) + int0(stats?.losses);
  return games ? (int0(stats?.wins) / games) * 100 : 0;
}
