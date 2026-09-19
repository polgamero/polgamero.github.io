// js/tournamentRecovery.js — HF23.3.8 tournament client recovery markers.
// sessionStorage is intentionally tab-scoped: opening Tournament in another tab must never
// inherit authority to resolve the match that is still alive elsewhere.

const ACTIVE_MATCH_KEY = 'argentinia.tournament.activeMatch.v1';
const PENDING_SETTLEMENT_KEY = 'argentinia.tournament.pendingSettlement.v1';

function readJson(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function markTournamentActiveMatch(payload = {}) {
  const tournamentId = String(payload.tournamentId || '').trim();
  const matchId = String(payload.matchId || '').trim();
  if (!tournamentId || !matchId) return false;
  return writeJson(ACTIVE_MATCH_KEY, {
    tournamentId,
    matchId,
    roundKey: String(payload.roundKey || '').trim(),
    savedAtMs: Date.now()
  });
}

export function readTournamentActiveMatch() {
  return readJson(ACTIVE_MATCH_KEY);
}

export function clearTournamentActiveMatch() {
  try { sessionStorage.removeItem(ACTIVE_MATCH_KEY); } catch {}
}

export function markTournamentPendingSettlement(payload = {}) {
  const tournamentId = String(payload.tournamentId || '').trim();
  const matchId = String(payload.matchId || '').trim();
  if (!tournamentId || !matchId) return false;
  return writeJson(PENDING_SETTLEMENT_KEY, {
    tournamentId,
    matchId,
    roundKey: String(payload.roundKey || '').trim(),
    won: payload.won === true,
    savedAtMs: Date.now()
  });
}

export function readTournamentPendingSettlement() {
  return readJson(PENDING_SETTLEMENT_KEY);
}

export function clearTournamentPendingSettlement() {
  try { sessionStorage.removeItem(PENDING_SETTLEMENT_KEY); } catch {}
}

export function clearTournamentRecoveryMarkers() {
  clearTournamentPendingSettlement();
  clearTournamentActiveMatch();
}

export function tournamentRecoveryMatchesActive(tournament, marker) {
  const active = tournament?.activeMatch;
  if (!active || !marker) return false;
  return String(tournament?.tournamentId || '') === String(marker.tournamentId || '')
    && String(active?.matchId || '') === String(marker.matchId || '');
}

export function isReloadNavigation() {
  try {
    const entry = performance?.getEntriesByType?.('navigation')?.[0];
    if (entry?.type) return entry.type === 'reload';
    return Number(performance?.navigation?.type) === 1;
  } catch {
    return false;
  }
}
