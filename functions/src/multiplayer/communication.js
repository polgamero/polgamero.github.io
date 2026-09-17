import { FieldValue } from 'firebase-admin/firestore';
import { economyError } from '../shared/errors.js';
import { loadTrustedEmoteCatalog, userCanUseEmote } from '../trusted/emoteCatalog.js';
import { assertUserNotBanned, loadCommunityModerationPolicy } from '../community/community.js';
import { communityContainsBlockedLanguage } from '../community/moderationPolicy.js';

export const MULTIPLAYER_SOCIAL_SCHEMA_VERSION = 1;
export const CHAT_MAX_CHARS = 220;
export const COMMUNICATION_EVENT_CAP = 40;
export const CHAT_MIN_INTERVAL_MS = 1500;
export const CHAT_BURST_WINDOW_MS = 15000;
export const CHAT_BURST_MAX = 5;
export const EMOTE_MIN_INTERVAL_MS = 4000;
export const EMOTE_BURST_WINDOW_MS = 20000;
export const EMOTE_BURST_MAX = 3;
export const COMMUNICATION_TTL_MS = 48 * 60 * 60 * 1000;

// Legacy in-match communication validators. HF20 lobby chat is additive and must not
// replace or shadow these contracts used by multiplayer chat/emotes.
function cleanMatchId(value) {
  const id = String(value || '').trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(id)) throw economyError('MULTIPLAYER_SOCIAL_MATCH_INVALID');
  return id;
}
export function normalizeChatText(value) {
  const text = String(value ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || text.length > CHAT_MAX_CHARS) throw economyError('MULTIPLAYER_CHAT_INVALID', { maxChars:CHAT_MAX_CHARS });
  return text;
}

// HF20 — Lobby policy is pure/testable; this module owns only Firebase persistence.
import {
  LOBBY_CHAT_EVENT_CAP, LOBBY_CHAT_RETENTION_MS, LOBBY_CHAT_MIN_INTERVAL_MS,
  normalizeLobbyChatText as evaluateLobbyText, evaluateLobbyChatRate
} from './lobbyChatPolicy.js';

export const LOBBY_CHAT_SCHEMA_VERSION = 1;
function normalizeLobbyChatText(value, extraWords = []) {
  const result = evaluateLobbyText(value, extraWords);
  if (!result.ok) throw economyError(result.code, result.details);
  return result.text;
}
function applyLobbyChatRateLimit(rawRate = {}, text = '', nowMs = Date.now()) {
  const result = evaluateLobbyChatRate(rawRate, text, nowMs);
  if (!result.ok) throw economyError(result.code, result.details);
  return result.next;
}

function roleFor(match, uid) {
  if (match?.hostUid === uid) return 'host';
  if (match?.guestUid === uid) return 'guest';
  return null;
}
function cleanUsername(match, uid, role) {
  const row = match?.players?.[uid] || {};
  return String(row.username || row.displayName || (role === 'host' ? 'Jugador 1' : 'Jugador 2')).trim().slice(0, 40) || 'Jugador';
}
function cleanLobbyUsername(profile = {}) {
  return String(profile.username || profile.displayName || 'Jugador').trim().slice(0, 40) || 'Jugador';
}
function normalizedRate(raw = {}) {
  return {
    lastChatAtMs: Math.max(0, Math.floor(Number(raw.lastChatAtMs) || 0)),
    chatWindowAtMs: Math.max(0, Math.floor(Number(raw.chatWindowAtMs) || 0)),
    chatCount: Math.max(0, Math.floor(Number(raw.chatCount) || 0)),
    lastEmoteAtMs: Math.max(0, Math.floor(Number(raw.lastEmoteAtMs) || 0)),
    emoteWindowAtMs: Math.max(0, Math.floor(Number(raw.emoteWindowAtMs) || 0)),
    emoteCount: Math.max(0, Math.floor(Number(raw.emoteCount) || 0))
  };
}
function applyPersistentRateLimit(rate, kind, nowMs) {
  const next = { ...rate };
  if (kind === 'chat') {
    if (rate.lastChatAtMs && nowMs - rate.lastChatAtMs < CHAT_MIN_INTERVAL_MS) {
      throw economyError('MULTIPLAYER_CHAT_RATE_LIMIT', { retryAfterMs:CHAT_MIN_INTERVAL_MS - (nowMs-rate.lastChatAtMs) });
    }
    const sameWindow = rate.chatWindowAtMs && nowMs - rate.chatWindowAtMs < CHAT_BURST_WINDOW_MS;
    const count = sameWindow ? rate.chatCount : 0;
    if (count >= CHAT_BURST_MAX) throw economyError('MULTIPLAYER_CHAT_RATE_LIMIT', { retryAfterMs:Math.max(1, CHAT_BURST_WINDOW_MS-(nowMs-rate.chatWindowAtMs)) });
    next.lastChatAtMs = nowMs;
    next.chatWindowAtMs = sameWindow ? rate.chatWindowAtMs : nowMs;
    next.chatCount = count + 1;
  } else {
    if (rate.lastEmoteAtMs && nowMs - rate.lastEmoteAtMs < EMOTE_MIN_INTERVAL_MS) {
      throw economyError('MULTIPLAYER_EMOTE_RATE_LIMIT', { retryAfterMs:EMOTE_MIN_INTERVAL_MS - (nowMs-rate.lastEmoteAtMs) });
    }
    const sameWindow = rate.emoteWindowAtMs && nowMs - rate.emoteWindowAtMs < EMOTE_BURST_WINDOW_MS;
    const count = sameWindow ? rate.emoteCount : 0;
    if (count >= EMOTE_BURST_MAX) throw economyError('MULTIPLAYER_EMOTE_RATE_LIMIT', { retryAfterMs:Math.max(1, EMOTE_BURST_WINDOW_MS-(nowMs-rate.emoteWindowAtMs)) });
    next.lastEmoteAtMs = nowMs;
    next.emoteWindowAtMs = sameWindow ? rate.emoteWindowAtMs : nowMs;
    next.emoteCount = count + 1;
  }
  return next;
}

export async function sendLobbyCommunication({ db, uid, text = '' }) {
  const [, policy] = await Promise.all([
    assertUserNotBanned(db, uid, 'lobby_chat'),
    loadCommunityModerationPolicy(db)
  ]);
  const cleanText = normalizeLobbyChatText(text, policy.blockedWords);
  const commRef = db.collection('lobbyCommunications').doc('global');
  const rateRef = db.collection('lobbyChatRate').doc(uid);
  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async tx => {
    const [commSnap, rateSnap, userSnap] = await Promise.all([tx.get(commRef), tx.get(rateRef), tx.get(userRef)]);
    if (!userSnap.exists) throw economyError('PROFILE_MISSING');
    const nowMs = Date.now();
    const newRate = applyLobbyChatRateLimit(rateSnap.exists ? rateSnap.data() : {}, cleanText, nowMs);
    const current = commSnap.exists ? (commSnap.data() || {}) : {};
    const seq = Math.max(0, Math.floor(Number(current.nextSeq) || 0)) + 1;
    const event = { seq, type:'chat', uid, username:cleanLobbyUsername(userSnap.data() || {}), text:cleanText, createdAtMs:nowMs };
    const cutoffMs = nowMs - LOBBY_CHAT_RETENTION_MS;
    const retained = (Array.isArray(current.events) ? current.events : []).filter(item => Math.max(0, Number(item?.createdAtMs) || 0) >= cutoffMs);
    const events = [...retained, event].slice(-LOBBY_CHAT_EVENT_CAP);
    tx.set(commRef, {
      schemaVersion:LOBBY_CHAT_SCHEMA_VERSION,
      channel:'global',
      nextSeq:seq,
      events,
      updatedAt:FieldValue.serverTimestamp()
    }, { merge:false });
    tx.set(rateRef, { ...newRate, updatedAt:FieldValue.serverTimestamp() }, { merge:false });
    return { event, nextAllowedInMs:LOBBY_CHAT_MIN_INTERVAL_MS };
  });
}


export async function deleteLobbyCommunication({ db, uid, seq: rawSeq }) {
  const seq = Math.floor(Number(rawSeq));
  if (!Number.isInteger(seq) || seq <= 0) throw economyError('LOBBY_CHAT_MESSAGE_NOT_FOUND');
  const commRef = db.collection('lobbyCommunications').doc('global');
  const auditRef = db.collection('lobbyModerationAudit').doc();
  return db.runTransaction(async tx => {
    const snap = await tx.get(commRef);
    const current = snap.exists ? (snap.data() || {}) : {};
    const nowMs = Date.now();
    const cutoffMs = nowMs - LOBBY_CHAT_RETENTION_MS;
    const all = Array.isArray(current.events) ? current.events : [];
    const removed = all.find(item => Math.floor(Number(item?.seq) || 0) === seq) || null;
    if (!removed) throw economyError('LOBBY_CHAT_MESSAGE_NOT_FOUND');
    const events = all.filter(item => Math.floor(Number(item?.seq) || 0) !== seq)
      .filter(item => Math.max(0, Number(item?.createdAtMs) || 0) >= cutoffMs)
      .slice(-LOBBY_CHAT_EVENT_CAP);
    tx.set(commRef, {
      schemaVersion:LOBBY_CHAT_SCHEMA_VERSION,
      channel:'global',
      nextSeq:Math.max(0, Math.floor(Number(current.nextSeq) || 0)),
      events,
      updatedAt:FieldValue.serverTimestamp()
    }, { merge:false });
    tx.create(auditRef, {
      moderatorUid:uid,
      removedSeq:seq,
      removedUid:String(removed.uid || ''),
      removedCreatedAtMs:Math.max(0, Number(removed.createdAtMs) || 0),
      action:'delete_lobby_message',
      immutable:true,
      createdAt:FieldValue.serverTimestamp()
    });
    return { deletedSeq:seq };
  });
}

export async function sendMultiplayerCommunication({ db, uid, matchId, type, text = '', emoteId = '' }) {
  const id = cleanMatchId(matchId);
  const kind = String(type || '').trim().toLowerCase();
  if (!['chat','emote'].includes(kind)) throw economyError('MULTIPLAYER_SOCIAL_TYPE_INVALID');
  const [, policy] = await Promise.all([
    assertUserNotBanned(db, uid, kind === 'chat' ? 'match_chat' : 'match_emote'),
    kind === 'chat' ? loadCommunityModerationPolicy(db) : Promise.resolve({ blockedWords:[] })
  ]);
  const cleanText = kind === 'chat' ? normalizeChatText(text) : '';
  if (kind === 'chat' && communityContainsBlockedLanguage(cleanText, policy.blockedWords)) throw economyError('LOBBY_CHAT_PROFANITY');
  const cleanEmoteId = kind === 'emote' ? String(emoteId || '').trim() : '';

  const matchRef = db.collection('matches').doc(id);
  const commRef = db.collection('matchCommunications').doc(id);
  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async tx => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) throw economyError('PVP_MATCH_NOT_FOUND');
    const match = matchSnap.data() || {};
    const role = roleFor(match, uid);
    if (!role) throw economyError('PVP_NOT_MATCH_PARTICIPANT');
    if (match.status !== 'active' || !match.hostUid || !match.guestUid || match.gameOver === true || match.abandonedBy || match.endedAt) {
      throw economyError('MULTIPLAYER_SOCIAL_MATCH_CLOSED');
    }
    if (match.hostReady !== true || match.guestReady !== true) throw economyError('MULTIPLAYER_SOCIAL_NOT_READY');

    const [commSnap, userSnap, emoteCatalog] = await Promise.all([
      tx.get(commRef),
      kind === 'emote' ? tx.get(userRef) : Promise.resolve(null),
      kind === 'emote' ? loadTrustedEmoteCatalog(db, tx) : Promise.resolve(null)
    ]);
    if (kind === 'emote') {
      if (!userSnap?.exists) throw economyError('PROFILE_MISSING');
      const item = emoteCatalog?.byId?.get(cleanEmoteId) || null;
      if (!item || item.active === false) throw economyError('MULTIPLAYER_EMOTE_INVALID');
      if (!userCanUseEmote(userSnap.data() || {}, cleanEmoteId, emoteCatalog.items)) throw economyError('MULTIPLAYER_EMOTE_NOT_OWNED');
    }

    const current = commSnap.exists ? (commSnap.data() || {}) : {};
    const nowMs = Date.now();
    const rateRoot = current.rate && typeof current.rate === 'object' ? current.rate : {};
    const oldRate = normalizedRate(rateRoot[role]);
    const newRate = applyPersistentRateLimit(oldRate, kind, nowMs);
    const seq = Math.max(0, Math.floor(Number(current.nextSeq) || 0)) + 1;
    const event = {
      seq, type:kind, uid, role, username:cleanUsername(match, uid, role), createdAtMs:nowMs,
      ...(kind === 'chat' ? { text:cleanText } : { emoteId:cleanEmoteId })
    };
    const events = [...(Array.isArray(current.events) ? current.events : []), event].slice(-COMMUNICATION_EVENT_CAP);
    tx.set(commRef, {
      schemaVersion:MULTIPLAYER_SOCIAL_SCHEMA_VERSION,
      matchId:id,
      hostUid:String(match.hostUid || ''), guestUid:String(match.guestUid || ''),
      nextSeq:seq, events,
      rate:{ ...rateRoot, [role]:newRate },
      expiresAt:new Date(nowMs + COMMUNICATION_TTL_MS),
      updatedAt:FieldValue.serverTimestamp()
    }, { merge:false });
    return { event, nextAllowedInMs: kind === 'chat' ? CHAT_MIN_INTERVAL_MS : EMOTE_MIN_INTERVAL_MS };
  });
}
