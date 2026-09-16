import { publishPlayerPresence, removePlayerPresence } from './firebaseClient.js';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION } from './version.js';

export const PLAYER_PRESENCE_HEARTBEAT_MS = 45_000;
export const PLAYER_PRESENCE_STALE_MS = 110_000;

const ALLOWED_ACTIVITIES = new Set([
  'menu', 'multiplayer_lobby', 'multiplayer_setup', 'multiplayer',
  'solo', 'tournament', 'away'
]);
const ALLOWED_AVAILABILITY = new Set(['available', 'busy', 'away', 'dnd']);
const ALLOWED_DIFFICULTIES = new Set(['easy', 'medium', 'hard', '']);

let activeUid = null;
let heartbeatTimer = null;
let visibilityBound = false;
let current = {
  activity: 'menu',
  availability: 'available',
  difficulty: '',
  tournamentRoundKey: ''
};
let writeSerial = 0;
const CHALLENGE_INVITES_KEY = 'argentinia.multiplayer.challengeInvitesEnabled.v1';
let challengeInteractionBlocked = false;
let challengeInvitesEnabled = (() => {
  try { return localStorage.getItem(CHALLENGE_INVITES_KEY) !== '0'; } catch { return true; }
})();

function cleanString(value, max = 48) {
  return String(value ?? '').trim().slice(0, max);
}
function normalizeActivity(value) {
  const activity = cleanString(value, 32).toLowerCase();
  return ALLOWED_ACTIVITIES.has(activity) ? activity : 'menu';
}
function normalizeAvailability(value) {
  const availability = cleanString(value, 16).toLowerCase();
  return ALLOWED_AVAILABILITY.has(availability) ? availability : 'busy';
}
function normalizeDifficulty(value) {
  const difficulty = cleanString(value, 12).toLowerCase();
  return ALLOWED_DIFFICULTIES.has(difficulty) ? difficulty : '';
}
function effectiveSnapshot() {
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  let availability = hidden && current.availability === 'available' ? 'away' : current.availability;
  if (!hidden && !challengeInvitesEnabled && availability === 'available') availability = 'dnd';
  if (!hidden && challengeInteractionBlocked && availability === 'available' && ['menu','multiplayer_lobby'].includes(current.activity)) availability = 'busy';
  return {
    activity: hidden && current.activity === 'menu' ? 'away' : current.activity,
    availability,
    difficulty: current.difficulty,
    tournamentRoundKey: current.tournamentRoundKey,
    visibility: hidden ? 'hidden' : 'visible',
    engineVersion: ENGINE_VERSION,
    engineProtocolVersion: ENGINE_PROTOCOL_VERSION
  };
}
async function writePresence() {
  const uid = activeUid;
  if (!uid) return false;
  const serial = ++writeSerial;
  try {
    await publishPlayerPresence(uid, effectiveSnapshot());
    return serial === writeSerial;
  } catch (error) {
    // Presence must never block gameplay/menu. Security/rules/network errors are diagnostic only.
    console.warn('[Presence] No se pudo publicar presencia:', error);
    return false;
  }
}
function restartHeartbeat() {
  if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  // Cost guard: una pestaña oculta publica AWAY una vez y deja de gastar heartbeats.
  // Al volver a visible se reanuda inmediatamente.
  if (activeUid && !hidden) heartbeatTimer = setInterval(() => { void writePresence(); }, PLAYER_PRESENCE_HEARTBEAT_MS);
}
function bindVisibilityOnce() {
  if (visibilityBound || typeof document === 'undefined') return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (!activeUid) return;
    restartHeartbeat();
    void writePresence();
  });
  globalThis.addEventListener?.('online', () => {
    if (activeUid) void writePresence();
  });
}

export function startPlayerPresence(uid) {
  const nextUid = cleanString(uid, 160);
  if (!nextUid) return;
  activeUid = nextUid;
  current = { activity: 'menu', availability: 'available', difficulty: '', tournamentRoundKey: '' };
  bindVisibilityOnce();
  restartHeartbeat();
  void writePresence();
}

export function setPlayerPresenceActivity(activity, options = {}) {
  current = {
    activity: normalizeActivity(activity),
    availability: normalizeAvailability(options.availability ?? (activity === 'menu' || activity === 'multiplayer_lobby' ? 'available' : 'busy')),
    difficulty: normalizeDifficulty(options.difficulty),
    tournamentRoundKey: cleanString(options.tournamentRoundKey, 40)
  };
  if (activeUid) void writePresence();
}



export function getChallengeInteractionBlocked() { return challengeInteractionBlocked; }

export function setChallengeInteractionBlocked(blocked) {
  const next = blocked === true;
  if (challengeInteractionBlocked === next) return challengeInteractionBlocked;
  challengeInteractionBlocked = next;
  if (activeUid) void writePresence();
  try { globalThis.dispatchEvent?.(new CustomEvent('argentinia:challenge-interaction-changed', { detail:{ blocked:challengeInteractionBlocked } })); } catch {}
  return challengeInteractionBlocked;
}

export function getChallengeInvitesEnabled() { return challengeInvitesEnabled; }

export function setChallengeInvitesEnabled(enabled) {
  challengeInvitesEnabled = enabled !== false;
  try { localStorage.setItem(CHALLENGE_INVITES_KEY, challengeInvitesEnabled ? '1' : '0'); } catch {}
  if (activeUid) void writePresence();
  try { globalThis.dispatchEvent?.(new CustomEvent('argentinia:challenge-invites-changed', { detail:{ enabled:challengeInvitesEnabled } })); } catch {}
  return challengeInvitesEnabled;
}

export async function stopPlayerPresence({ remove = true } = {}) {
  const uid = activeUid;
  activeUid = null;
  writeSerial += 1;
  if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  if (remove && uid) {
    try { await removePlayerPresence(uid); }
    catch (error) { console.warn('[Presence] No se pudo retirar presencia:', error); }
  }
}

export function presenceTimestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return Number(value.toMillis()) || 0;
  if (typeof value.seconds === 'number') return (Number(value.seconds) * 1000) + Math.floor((Number(value.nanoseconds) || 0) / 1e6);
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

export function isPresenceOnline(record, nowMs = Date.now()) {
  const seen = presenceTimestampMs(record?.lastSeenAt || record?.updatedAt);
  return seen > 0 && Math.max(0, nowMs - seen) <= PLAYER_PRESENCE_STALE_MS;
}

export function isPresenceAvailable(record, nowMs = Date.now()) {
  return isPresenceOnline(record, nowMs) && record?.availability === 'available';
}

const DIFFICULTY_LABEL = { easy: 'Fácil', medium: 'Medio', hard: 'Difícil' };
const ROUND_LABEL = {
  round16: 'Octavos de final',
  quarter: 'Cuartos de final',
  semi: 'Semifinal',
  final: 'Final',
  // Compatibilidad defensiva si un fixture histórico/externo usa nombres largos.
  round_of_16: 'Octavos de final',
  quarterfinal: 'Cuartos de final',
  semifinal: 'Semifinal'
};

export function describePresenceActivity(record, nowMs = Date.now()) {
  if (!isPresenceOnline(record, nowMs)) return 'Desconectado';
  if (record?.availability === 'away' || record?.activity === 'away') return 'Ausente';
  if (record?.availability === 'dnd') return 'No molestar';
  switch (record?.activity) {
    case 'solo': return `Jugando Solo · ${DIFFICULTY_LABEL[record?.difficulty] || '—'}`;
    case 'tournament': return `Jugando ${ROUND_LABEL[record?.tournamentRoundKey] || 'Torneo'} · Torneo`;
    case 'multiplayer': return 'Jugando Multiplayer';
    case 'multiplayer_setup': return 'Preparando Multiplayer';
    case 'multiplayer_lobby': return record?.availability === 'available' ? 'Disponible · Multiplayer' : 'En sala Multiplayer';
    default: return record?.availability === 'available' ? 'Disponible' : 'Ocupado';
  }
}
