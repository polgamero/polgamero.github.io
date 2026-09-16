import crypto from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { economyError } from '../shared/errors.js';
import { ENGINE_VERSION, MULTIPLAYER_PROTOCOL_VERSION } from '../shared/constants.js';

export const DIRECT_CHALLENGE_SCHEMA_VERSION = 1;
export const DIRECT_CHALLENGE_TTL_MS = 20_000;
export const DIRECT_CHALLENGE_PRESENCE_STALE_MS = 110_000;
export const DIRECT_CHALLENGE_MIN_INTERVAL_MS = 5_000;
export const DIRECT_CHALLENGE_PAIR_COOLDOWN_MS = 15_000;
export const DIRECT_CHALLENGE_WINDOW_MS = 5 * 60_000;
export const DIRECT_CHALLENGE_WINDOW_MAX = 8;

const MATCH_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SAFE_SESSION_RE = /^[A-Za-z0-9:_-]{8,96}$/;

function cleanUid(value) {
  const uid = String(value || '').trim();
  if (!uid || uid.length > 128) throw economyError('MULTIPLAYER_CHALLENGE_TARGET_INVALID');
  return uid;
}
function cleanSessionId(value) {
  const id = String(value || '').trim();
  if (!SAFE_SESSION_RE.test(id)) throw economyError('MULTIPLAYER_CHALLENGE_SESSION_INVALID');
  return id;
}
function cleanChallengeId(value) {
  const id = String(value || '').trim();
  if (!/^chal_[A-Za-z0-9_-]{8,96}$/.test(id)) throw economyError('MULTIPLAYER_CHALLENGE_INVALID');
  return id;
}
function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return Number(value.toMillis()) || 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1e6);
  return 0;
}
function isFreshLobbyPresence(data, nowMs) {
  if (!data || data.visibility === 'hidden') return false;
  if (data.availability !== 'available') return false;
  if (!['menu','multiplayer_lobby'].includes(String(data.activity || ''))) return false;
  const seen = timestampMs(data.lastSeenAt || data.updatedAt);
  return seen > 0 && nowMs - seen <= DIRECT_CHALLENGE_PRESENCE_STALE_MS;
}
function lockIsLive(lock, nowMs) {
  return !!lock?.challengeId && timestampMs(lock.expiresAt) > nowMs;
}
function safeProfile(data = {}, fallback = 'Jugador') {
  const username = String(data.username || data.displayName || '').trim().slice(0, 40) || fallback;
  const photoURL = String(data.photoURL || '').trim().slice(0, 2048);
  return { username, displayName: username, photoURL };
}
function generateChallengeId(nowMs) {
  return `chal_${nowMs.toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}
function generateMatchCode() {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) code += MATCH_ALPHABET[bytes[i] % MATCH_ALPHABET.length];
  return code;
}
function rateState(data = {}, nowMs, targetUid) {
  const recent = Array.isArray(data.recentInviteMs)
    ? data.recentInviteMs.map(Number).filter(ms => Number.isFinite(ms) && nowMs - ms < DIRECT_CHALLENGE_WINDOW_MS)
    : [];
  const lastInviteAtMs = Number(data.lastInviteAtMs) || 0;
  const lastTargetAtMs = Number(data.lastTargetAtMs) || 0;
  const lastTargetUid = String(data.lastTargetUid || '');
  // The pair-specific cooldown is more informative than the generic invite cadence.
  // When both apply (for example, immediately after a reject), preserve the specific reason.
  if (lastTargetUid === targetUid && lastTargetAtMs && nowMs - lastTargetAtMs < DIRECT_CHALLENGE_PAIR_COOLDOWN_MS) {
    throw economyError('MULTIPLAYER_CHALLENGE_PAIR_COOLDOWN', { retryAfterMs: DIRECT_CHALLENGE_PAIR_COOLDOWN_MS - (nowMs-lastTargetAtMs) });
  }
  if (lastInviteAtMs && nowMs - lastInviteAtMs < DIRECT_CHALLENGE_MIN_INTERVAL_MS) {
    throw economyError('MULTIPLAYER_CHALLENGE_RATE_LIMIT', { retryAfterMs: DIRECT_CHALLENGE_MIN_INTERVAL_MS - (nowMs-lastInviteAtMs) });
  }
  if (recent.length >= DIRECT_CHALLENGE_WINDOW_MAX) throw economyError('MULTIPLAYER_CHALLENGE_RATE_LIMIT');
  recent.push(nowMs);
  return { recentInviteMs: recent.slice(-DIRECT_CHALLENGE_WINDOW_MAX), lastInviteAtMs: nowMs, lastTargetAtMs: nowMs, lastTargetUid: targetUid, updatedAt: Timestamp.fromMillis(nowMs) };
}

async function assertNoLiveMatch(tx, db, userSnap, uid) {
  const activeMatchId = String(userSnap?.data()?.activeMatchId || '').trim().toUpperCase();
  if (!activeMatchId) return;
  const ref = db.doc(`matches/${activeMatchId}`);
  const snap = await tx.get(ref);
  if (!snap.exists) return;
  const d = snap.data() || {};
  const participant = d.hostUid === uid || d.guestUid === uid;
  const live = participant && !d.gameOver && !d.endedAt && !d.abandonedBy && ['waiting','active'].includes(String(d.status || ''));
  if (live) throw economyError('MULTIPLAYER_CHALLENGE_ACTIVE_MATCH');
}

export async function createDirectChallenge({ db, uid, targetUid: rawTargetUid, sessionId: rawSessionId }) {
  const inviterUid = cleanUid(uid);
  const inviteeUid = cleanUid(rawTargetUid);
  if (inviterUid === inviteeUid) throw economyError('MULTIPLAYER_CHALLENGE_SELF');
  const inviterSessionId = cleanSessionId(rawSessionId);
  const nowMs = Date.now();
  const expiresMs = nowMs + DIRECT_CHALLENGE_TTL_MS;
  const challengeId = generateChallengeId(nowMs);
  const challengeRef = db.doc(`multiplayerChallenges/${challengeId}`);
  const inviterLockRef = db.doc(`multiplayerChallengeLocks/${inviterUid}`);
  const inviteeLockRef = db.doc(`multiplayerChallengeLocks/${inviteeUid}`);
  const rateRef = db.doc(`multiplayerChallengeRate/${inviterUid}`);
  const inviterUserRef = db.doc(`users/${inviterUid}`);
  const inviteeUserRef = db.doc(`users/${inviteeUid}`);
  const inviterPresenceRef = db.doc(`playerPresence/${inviterUid}`);
  const inviteePresenceRef = db.doc(`playerPresence/${inviteeUid}`);

  return db.runTransaction(async tx => {
    const [inviterUser, inviteeUser, inviterPresence, inviteePresence, inviterLock, inviteeLock, rateSnap] = await Promise.all([
      tx.get(inviterUserRef), tx.get(inviteeUserRef), tx.get(inviterPresenceRef), tx.get(inviteePresenceRef),
      tx.get(inviterLockRef), tx.get(inviteeLockRef), tx.get(rateRef)
    ]);
    if (!inviterUser.exists || !inviteeUser.exists) throw economyError('MULTIPLAYER_CHALLENGE_TARGET_INVALID');
    if (!isFreshLobbyPresence(inviterPresence.data(), nowMs)) throw economyError('MULTIPLAYER_CHALLENGE_INVITER_UNAVAILABLE');
    if (!isFreshLobbyPresence(inviteePresence.data(), nowMs)) throw economyError('MULTIPLAYER_CHALLENGE_TARGET_UNAVAILABLE');
    if (lockIsLive(inviterLock.data(), nowMs)) throw economyError('MULTIPLAYER_CHALLENGE_ALREADY_PENDING');
    if (lockIsLive(inviteeLock.data(), nowMs)) throw economyError('MULTIPLAYER_CHALLENGE_TARGET_BUSY');
    await assertNoLiveMatch(tx, db, inviterUser, inviterUid);
    await assertNoLiveMatch(tx, db, inviteeUser, inviteeUid);
    const inviterProfile = safeProfile(inviterUser.data(), 'Jugador');
    const inviteeProfile = safeProfile(inviteeUser.data(), 'Jugador');
    const createdAt = Timestamp.fromMillis(nowMs);
    const expiresAt = Timestamp.fromMillis(expiresMs);
    const rate = rateState(rateSnap.data(), nowMs, inviteeUid);
    tx.set(challengeRef, {
      schemaVersion:DIRECT_CHALLENGE_SCHEMA_VERSION, status:'pending', challengeId,
      inviterUid, inviteeUid, participants:[inviterUid, inviteeUid],
      inviterUsername:inviterProfile.username, inviteeUsername:inviteeProfile.username,
      inviterPhotoURL:inviterProfile.photoURL, inviteePhotoURL:inviteeProfile.photoURL,
      inviterSessionId, engineVersion:ENGINE_VERSION, engineProtocolVersion:MULTIPLAYER_PROTOCOL_VERSION,
      createdAt, expiresAt, resolvedAt:null, matchCode:null
    });
    tx.set(inviterLockRef, { challengeId, peerUid:inviteeUid, direction:'outgoing', expiresAt, updatedAt:createdAt });
    tx.set(inviteeLockRef, { challengeId, peerUid:inviterUid, direction:'incoming', expiresAt, updatedAt:createdAt });
    tx.set(rateRef, rate, { merge:true });
    return { challengeId, expiresAtMs:expiresMs, targetUid:inviteeUid, targetUsername:inviteeProfile.username };
  });
}

async function loadPendingChallengeTx(tx, ref, uid, action, nowMs) {
  const snap = await tx.get(ref);
  if (!snap.exists) throw economyError('MULTIPLAYER_CHALLENGE_NOT_FOUND');
  const d = snap.data() || {};
  if (!Array.isArray(d.participants) || !d.participants.includes(uid)) throw economyError('MULTIPLAYER_CHALLENGE_NOT_PARTICIPANT');
  if (d.status !== 'pending') throw economyError('MULTIPLAYER_CHALLENGE_ALREADY_RESOLVED', { status:d.status || '' });
  const expiresAtMs = timestampMs(d.expiresAt);
  if (action !== 'expire' && (!expiresAtMs || nowMs >= expiresAtMs)) throw economyError('MULTIPLAYER_CHALLENGE_EXPIRED');
  if (action === 'accept' || action === 'reject') {
    if (d.inviteeUid !== uid) throw economyError('MULTIPLAYER_CHALLENGE_INVITEE_ONLY');
  }
  if (action === 'cancel' && d.inviterUid !== uid) throw economyError('MULTIPLAYER_CHALLENGE_INVITER_ONLY');
  if (action === 'expire' && expiresAtMs && nowMs < expiresAtMs) throw economyError('MULTIPLAYER_CHALLENGE_NOT_EXPIRED');
  return d;
}

function deleteMatchingLock(tx, ref, snap, challengeId) {
  if (snap.exists && String(snap.data()?.challengeId || '') === challengeId) tx.delete(ref);
}

export async function resolveDirectChallenge({ db, uid: rawUid, challengeId: rawChallengeId, action: rawAction, sessionId: rawSessionId = '' }) {
  const uid = cleanUid(rawUid);
  const challengeId = cleanChallengeId(rawChallengeId);
  const action = String(rawAction || '').trim().toLowerCase();
  if (!['accept','reject','cancel','expire'].includes(action)) throw economyError('MULTIPLAYER_CHALLENGE_ACTION_INVALID');
  const acceptSessionId = action === 'accept' ? cleanSessionId(rawSessionId) : '';
  const nowMs = Date.now();
  const challengeRef = db.doc(`multiplayerChallenges/${challengeId}`);
  const candidateCodes = action === 'accept' ? Array.from({length:5}, generateMatchCode) : [];

  return db.runTransaction(async tx => {
    const challenge = await loadPendingChallengeTx(tx, challengeRef, uid, action, nowMs);
    const inviterUid = challenge.inviterUid;
    const inviteeUid = challenge.inviteeUid;
    const inviterLockRef = db.doc(`multiplayerChallengeLocks/${inviterUid}`);
    const inviteeLockRef = db.doc(`multiplayerChallengeLocks/${inviteeUid}`);
    const [inviterLock, inviteeLock] = await Promise.all([tx.get(inviterLockRef), tx.get(inviteeLockRef)]);

    if (action !== 'accept') {
      const status = action === 'reject' ? 'rejected' : (action === 'cancel' ? 'cancelled' : 'expired');
      tx.update(challengeRef, { status, resolvedAt:Timestamp.fromMillis(nowMs) });
      deleteMatchingLock(tx, inviterLockRef, inviterLock, challengeId);
      deleteMatchingLock(tx, inviteeLockRef, inviteeLock, challengeId);
      return { challengeId, status, matchCode:null };
    }

    if (!lockIsLive(inviterLock.data(), nowMs) || !lockIsLive(inviteeLock.data(), nowMs)
        || inviterLock.data()?.challengeId !== challengeId || inviteeLock.data()?.challengeId !== challengeId) {
      throw economyError('MULTIPLAYER_CHALLENGE_LOCK_LOST');
    }
    const inviterUserRef = db.doc(`users/${inviterUid}`);
    const inviteeUserRef = db.doc(`users/${inviteeUid}`);
    const inviterPresenceRef = db.doc(`playerPresence/${inviterUid}`);
    const inviteePresenceRef = db.doc(`playerPresence/${inviteeUid}`);
    const [inviterUser, inviteeUser, inviterPresence, inviteePresence] = await Promise.all([
      tx.get(inviterUserRef), tx.get(inviteeUserRef), tx.get(inviterPresenceRef), tx.get(inviteePresenceRef)
    ]);
    if (!inviterUser.exists || !inviteeUser.exists) throw economyError('MULTIPLAYER_CHALLENGE_TARGET_INVALID');
    if (!isFreshLobbyPresence(inviterPresence.data(), nowMs)) throw economyError('MULTIPLAYER_CHALLENGE_INVITER_UNAVAILABLE');
    if (!isFreshLobbyPresence(inviteePresence.data(), nowMs)) throw economyError('MULTIPLAYER_CHALLENGE_TARGET_UNAVAILABLE');
    await assertNoLiveMatch(tx, db, inviterUser, inviterUid);
    await assertNoLiveMatch(tx, db, inviteeUser, inviteeUid);

    const candidateRefs = candidateCodes.map(code => db.doc(`matches/${code}`));
    const candidateSnaps = [];
    for (const ref of candidateRefs) candidateSnaps.push(await tx.get(ref));
    const freeIndex = candidateSnaps.findIndex(snap => !snap.exists);
    if (freeIndex < 0) throw economyError('MULTIPLAYER_CHALLENGE_MATCH_CODE_EXHAUSTED');
    const code = candidateCodes[freeIndex];
    const matchRef = candidateRefs[freeIndex];
    const inviterProfile = safeProfile(inviterUser.data(), challenge.inviterUsername || 'Jugador');
    const inviteeProfile = safeProfile(inviteeUser.data(), challenge.inviteeUsername || 'Jugador');
    const startingRole = crypto.randomInt(0,2) === 0 ? 'host' : 'guest';
    const nowTs = Timestamp.fromMillis(nowMs);
    const hostSessionId = cleanSessionId(challenge.inviterSessionId);
    tx.set(matchRef, {
      status:'active', hostUid:inviterUid, startingRole, guestUid:inviteeUid,
      hostReady:false, guestReady:false, bothReadyAt:null, gameOver:false, abandonedBy:null,
      syncRevision:0, syncFieldRevisions:{}, hostPrivateRevision:0, guestPrivateRevision:0,
      hostSessionId, guestSessionId:acceptSessionId, endedAt:null, terminalKind:null,
      winnerRole:null, turnCountAtEnd:null, engineVersion:ENGINE_VERSION,
      engineProtocolVersion:MULTIPLAYER_PROTOCOL_VERSION, hostEngineVersion:ENGINE_VERSION,
      guestEngineVersion:ENGINE_VERSION,
      players:{ [inviterUid]:inviterProfile, [inviteeUid]:inviteeProfile },
      createdAt:nowTs, updatedAt:nowTs, challengeId
    });
    tx.set(inviterUserRef, { activeMatchId:code }, { merge:true });
    tx.set(inviteeUserRef, { activeMatchId:code }, { merge:true });
    tx.update(challengeRef, { status:'accepted', resolvedAt:nowTs, matchCode:code, startingRole });
    deleteMatchingLock(tx, inviterLockRef, inviterLock, challengeId);
    deleteMatchingLock(tx, inviteeLockRef, inviteeLock, challengeId);
    return { challengeId, status:'accepted', matchCode:code, startingRole };
  });
}
