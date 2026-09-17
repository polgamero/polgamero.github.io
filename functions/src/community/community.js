import crypto from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { economyError } from '../shared/errors.js';
import { normalizeCommunityBlockedWords } from './moderationPolicy.js';

export const COMMUNITY_SCHEMA_VERSION = 1;
export const COMMUNITY_POLICY_PATH = 'gameConfig/communityModeration';
export const COMMUNITY_BAN_DURATIONS_MS = Object.freeze({
  '1h': 60 * 60_000,
  '24h': 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
  '30d': 30 * 24 * 60 * 60_000,
  permanent: null
});

function cleanText(value, max, code = 'COMMUNITY_TEXT_INVALID', { required = true } = {}) {
  const text = String(value ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
  if ((required && !text) || text.length > max) throw economyError(code, { maxChars:max });
  return text;
}
function cleanUid(value) {
  const uid = String(value || '').trim();
  if (!uid || uid.length > 128) throw economyError('COMMUNITY_TARGET_INVALID');
  return uid;
}
function cleanCaseId(value) {
  const id = String(value || '').trim();
  if (!/^case_[A-Za-z0-9_-]{8,100}$/.test(id)) throw economyError('COMMUNITY_CASE_INVALID');
  return id;
}
function cleanTradeId(value) {
  const id = String(value || '').trim();
  if (!/^trade_[A-Za-z0-9_.:-]{6,410}$/.test(id) || id.includes('/')) throw economyError('COMMUNITY_TRADE_INVALID');
  return id;
}
function cleanTradeNotificationId(value) {
  const id = String(value || '').trim();
  if (!/^trade_notice_[A-Za-z0-9_.:-]{8,410}$/.test(id) || id.includes('/')) throw economyError('TRADE_NOTIFICATION_INVALID');
  return id;
}
function safeProfile(data = {}) {
  return {
    username: String(data.username || data.displayName || 'Jugador').trim().slice(0, 40) || 'Jugador',
    email: String(data.email || '').trim().toLowerCase().slice(0, 320)
  };
}
function activeBanFromData(uid, data, nowMs = Date.now()) {
  if (!data || data.active !== true) return null;
  const permanent = data.permanent === true;
  const expiresAtMs = Math.max(0, Number(data.expiresAtMs) || 0);
  if (!permanent && (!expiresAtMs || expiresAtMs <= nowMs)) return null;
  return {
    uid, active:true, permanent, expiresAtMs: permanent ? null : expiresAtMs,
    reason:String(data.reason || '').slice(0,300),
    emailSnapshot:String(data.emailSnapshot || '').slice(0,320),
    usernameSnapshot:String(data.usernameSnapshot || 'Jugador').slice(0,40),
    createdAtMs:Math.max(0,Number(data.createdAtMs)||0),
    updatedAtMs:Math.max(0,Number(data.updatedAtMs)||0)
  };
}

export async function getActiveCommunityBan(db, uid, nowMs = Date.now()) {
  const clean = cleanUid(uid);
  const snap = await db.doc(`communityBans/${clean}`).get();
  return snap.exists ? activeBanFromData(clean, snap.data(), nowMs) : null;
}

export async function assertUserNotBanned(db, uid, capability = 'community') {
  const ban = await getActiveCommunityBan(db, uid);
  if (ban) throw economyError('COMMUNITY_BANNED', { capability, permanent:ban.permanent, expiresAtMs:ban.expiresAtMs, reason:ban.reason });
  return null;
}

export async function loadCommunityModerationPolicy(db) {
  const snap = await db.doc(COMMUNITY_POLICY_PATH).get();
  const data = snap.exists ? snap.data() || {} : {};
  return { schemaVersion:COMMUNITY_SCHEMA_VERSION, blockedWords:normalizeCommunityBlockedWords(data.blockedWords || []) };
}

export async function setCommunityBlockedWordsAdmin(db, words, moderatorUid) {
  const blockedWords = normalizeCommunityBlockedWords(words);
  const nowMs = Date.now();
  await db.doc(COMMUNITY_POLICY_PATH).set({ schemaVersion:COMMUNITY_SCHEMA_VERSION, blockedWords, updatedAtMs:nowMs, updatedAt:Timestamp.fromMillis(nowMs), updatedByUid:String(moderatorUid||'') }, { merge:true });
  await writeAudit(db, { type:'policy.blocked_words', moderatorUid, metadata:{ count:blockedWords.length } });
  return { blockedWords };
}

async function writeAudit(db, { type, moderatorUid = '', targetUid = '', caseId = '', metadata = {} }) {
  const nowMs = Date.now();
  const id = `audit_${nowMs.toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
  await db.doc(`communityModerationAudit/${id}`).set({ schemaVersion:COMMUNITY_SCHEMA_VERSION, type:String(type||''), moderatorUid:String(moderatorUid||''), targetUid:String(targetUid||''), caseId:String(caseId||''), metadata, createdAtMs:nowMs, createdAt:Timestamp.fromMillis(nowMs) });
}

export async function setCommunityBanAdmin(db, { targetUid, duration, reason, moderatorUid }) {
  const uid = cleanUid(targetUid);
  const durationKey = String(duration || '').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(COMMUNITY_BAN_DURATIONS_MS, durationKey)) throw economyError('COMMUNITY_BAN_DURATION_INVALID');
  const cleanReason = cleanText(reason, 300, 'COMMUNITY_BAN_REASON_INVALID');
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) throw economyError('COMMUNITY_TARGET_INVALID');
  const profile = safeProfile(userSnap.data());
  const nowMs = Date.now();
  const durationMs = COMMUNITY_BAN_DURATIONS_MS[durationKey];
  const permanent = durationMs == null;
  const expiresAtMs = permanent ? null : nowMs + durationMs;
  const data = { schemaVersion:COMMUNITY_SCHEMA_VERSION, uid, active:true, permanent, expiresAtMs, reason:cleanReason, emailSnapshot:profile.email, usernameSnapshot:profile.username, moderatorUid:String(moderatorUid||''), createdAtMs:nowMs, updatedAtMs:nowMs, createdAt:Timestamp.fromMillis(nowMs), updatedAt:Timestamp.fromMillis(nowMs) };
  await db.doc(`communityBans/${uid}`).set(data, { merge:false });
  await writeAudit(db, { type:'ban.set', moderatorUid, targetUid:uid, metadata:{ duration:durationKey, permanent, expiresAtMs, reason:cleanReason, emailSnapshot:profile.email } });
  return activeBanFromData(uid, data, nowMs);
}

export async function clearCommunityBanAdmin(db, { targetUid, reason = '', moderatorUid }) {
  const uid = cleanUid(targetUid);
  const cleanReason = cleanText(reason, 300, 'COMMUNITY_BAN_REASON_INVALID', { required:false });
  const nowMs = Date.now();
  await db.doc(`communityBans/${uid}`).set({ active:false, permanent:false, expiresAtMs:null, unbanReason:cleanReason, unbannedByUid:String(moderatorUid||''), updatedAtMs:nowMs, updatedAt:Timestamp.fromMillis(nowMs) }, { merge:true });
  await writeAudit(db, { type:'ban.clear', moderatorUid, targetUid:uid, metadata:{ reason:cleanReason } });
  return { uid, active:false };
}

function makeCaseId(nowMs) { return `case_${nowMs.toString(36)}_${crypto.randomBytes(6).toString('hex')}`; }

export async function createCommunityCase(db, { reporterUid, kind, targetUid = '', messageSeq = 0, tradeId = '', subject = '', text = '', reason = '' }) {
  const uid = cleanUid(reporterUid);
  const normalizedKind = String(kind || '').trim().toLowerCase();
  if (!['contact','report_user','report_lobby_message','dispute'].includes(normalizedKind)) throw economyError('COMMUNITY_CASE_KIND_INVALID');
  const cleanSubject = cleanText(subject, 100, 'COMMUNITY_CASE_SUBJECT_INVALID', { required:false });
  const cleanTextBody = cleanText(text || reason, 1000, 'COMMUNITY_CASE_TEXT_INVALID');
  const reporterSnap = await db.doc(`users/${uid}`).get();
  const reporter = safeProfile(reporterSnap.exists ? reporterSnap.data() : {});
  let target = null;
  let messageSnapshot = null;
  let tradeSnapshot = null;
  if (normalizedKind === 'report_user') {
    const targetId = cleanUid(targetUid);
    if (targetId === uid) throw economyError('COMMUNITY_CASE_SELF_REPORT');
    const targetSnap = await db.doc(`users/${targetId}`).get();
    if (!targetSnap.exists) throw economyError('COMMUNITY_TARGET_INVALID');
    target = { uid:targetId, ...safeProfile(targetSnap.data()) };
  } else if (normalizedKind === 'report_lobby_message') {
    const seq = Math.max(1, Math.floor(Number(messageSeq) || 0));
    const commSnap = await db.doc('lobbyCommunications/global').get();
    const events = Array.isArray(commSnap.data()?.events) ? commSnap.data().events : [];
    const event = events.find(row => Math.floor(Number(row?.seq)||0) === seq);
    if (!event || event.type !== 'chat') throw economyError('COMMUNITY_MESSAGE_NOT_FOUND');
    if (String(event.uid || '') === uid) throw economyError('COMMUNITY_CASE_SELF_REPORT');
    target = { uid:String(event.uid||''), username:String(event.username||'Jugador').slice(0,40), email:'' };
    messageSnapshot = { seq, uid:target.uid, username:target.username, text:String(event.text||'').slice(0,220), createdAtMs:Math.max(0,Number(event.createdAtMs)||0) };
  } else if (normalizedKind === 'dispute') {
    const id = cleanTradeId(tradeId);
    const receiptSnap = await db.doc(`tradeReceipts/${id}`).get();
    if (!receiptSnap.exists) throw economyError('COMMUNITY_TRADE_NOT_FOUND');
    const receipt = receiptSnap.data() || {};
    const ownerUid = String(receipt.ownerUid || '');
    const offererUid = String(receipt.offererUid || '');
    if (uid !== ownerUid && uid !== offererUid) throw economyError('COMMUNITY_TRADE_NOT_FOUND');
    const reporterIsOwner = uid === ownerUid;
    target = reporterIsOwner
      ? { uid:offererUid, username:String(receipt.offererUsername||'Jugador').slice(0,40), email:'' }
      : { uid:ownerUid, username:String(receipt.ownerUsername||'Jugador').slice(0,40), email:'' };
    tradeSnapshot = {
      tradeId:id,
      listingId:String(receipt.listingId||''),
      offerId:String(receipt.offerId||''),
      ownerUid, ownerUsername:String(receipt.ownerUsername||'Jugador').slice(0,40),
      offererUid, offererUsername:String(receipt.offererUsername||'Jugador').slice(0,40),
      ownerGaveCardId:String(receipt.ownerGaveCardId||''),
      offererGaveCardId:String(receipt.offererGaveCardId||''),
      completedAtMs:Math.max(0,Number(receipt.completedAtMs)||0)
    };
  }
  const nowMs = Date.now();
  const caseId = makeCaseId(nowMs);
  const data = { schemaVersion:COMMUNITY_SCHEMA_VERSION, caseId, reporterUid:uid, reporterUsername:reporter.username, reporterEmailSnapshot:reporter.email, kind:normalizedKind, targetUid:target?.uid || '', targetUsernameSnapshot:target?.username || '', targetEmailSnapshot:target?.email || '', messageSnapshot, tradeId:tradeSnapshot?.tradeId || '', tradeSnapshot, subject:cleanSubject, text:cleanTextBody, status:'open', response:'', responderUid:'', createdAtMs:nowMs, updatedAtMs:nowMs, resolvedAtMs:null, createdAt:Timestamp.fromMillis(nowMs), updatedAt:Timestamp.fromMillis(nowMs) };
  await db.doc(`communityCases/${caseId}`).set(data);
  return sanitizeCaseForUser(data);
}

function sanitizeCaseForUser(data = {}) {
  return { caseId:String(data.caseId||''), kind:String(data.kind||''), targetUid:String(data.targetUid||''), targetUsernameSnapshot:String(data.targetUsernameSnapshot||''), tradeId:String(data.tradeId||''), tradeSnapshot:data.tradeSnapshot || null, subject:String(data.subject||''), text:String(data.text||''), status:String(data.status||'open'), response:String(data.response||''), createdAtMs:Math.max(0,Number(data.createdAtMs)||0), updatedAtMs:Math.max(0,Number(data.updatedAtMs)||0), resolvedAtMs:data.resolvedAtMs == null ? null : Math.max(0,Number(data.resolvedAtMs)||0), acknowledgedAtMs:data.acknowledgedAtMs == null ? null : Math.max(0,Number(data.acknowledgedAtMs)||0) };
}
function sanitizeCaseForAdmin(data = {}) {
  return { ...sanitizeCaseForUser(data), reporterUid:String(data.reporterUid||''), reporterUsername:String(data.reporterUsername||'Jugador'), reporterEmailSnapshot:String(data.reporterEmailSnapshot||''), targetEmailSnapshot:String(data.targetEmailSnapshot||''), messageSnapshot:data.messageSnapshot || null, responderUid:String(data.responderUid||'') };
}

export async function getMyCommunityCases(db, uid) {
  const snap = await db.collection('communityCases').where('reporterUid','==',cleanUid(uid)).limit(50).get();
  return snap.docs.map(row => sanitizeCaseForUser(row.data())).sort((a,b)=>b.createdAtMs-a.createdAtMs).slice(0,30);
}

export async function getCommunityStatus(db, uid) {
  return { ban:await getActiveCommunityBan(db, uid), cases:await getMyCommunityCases(db, uid) };
}


export async function acknowledgeCommunityCase(db, { uid, caseId }) {
  const reporterUid = cleanUid(uid);
  const id = cleanCaseId(caseId);
  const ref = db.doc(`communityCases/${id}`);
  const snap = await ref.get();
  if (!snap.exists || String(snap.data()?.reporterUid || '') !== reporterUid) throw economyError('COMMUNITY_CASE_NOT_FOUND');
  if (String(snap.data()?.status || '') !== 'resolved') throw economyError('COMMUNITY_CASE_NOT_RESOLVED');
  const nowMs = Date.now();
  await ref.set({ acknowledgedAtMs:nowMs, updatedAtMs:nowMs, updatedAt:Timestamp.fromMillis(nowMs) }, { merge:true });
  return { caseId:id, acknowledgedAtMs:nowMs };
}

function sanitizeTradeNotification(data = {}) {
  return {
    notificationId:String(data.notificationId||''), type:String(data.type||''),
    listingOwnerUid:String(data.listingOwnerUid||''), listingOwnerUsername:String(data.listingOwnerUsername||'Jugador'),
    offeredCardId:String(data.offeredCardId||''), listedCardId:String(data.listedCardId||''),
    offerId:String(data.offerId||''), listingId:String(data.listingId||''), reason:String(data.reason||''),
    createdAtMs:Math.max(0,Number(data.createdAtMs)||0), readAtMs:data.readAtMs == null ? null : Math.max(0,Number(data.readAtMs)||0)
  };
}

export async function getPendingTradeNotifications(db, uid) {
  const recipientUid = cleanUid(uid);
  const snap = await db.collection('tradeNotifications').where('recipientUid','==',recipientUid).limit(50).get();
  return snap.docs.map(row => sanitizeTradeNotification(row.data()))
    .filter(item => !item.readAtMs && ['accepted','rejected'].includes(item.type))
    .sort((a,b)=>a.createdAtMs-b.createdAtMs).slice(0,20);
}

export async function acknowledgeTradeNotification(db, { uid, notificationId }) {
  const recipientUid = cleanUid(uid);
  const id = cleanTradeNotificationId(notificationId);
  const ref = db.doc(`tradeNotifications/${id}`);
  const snap = await ref.get();
  if (!snap.exists || String(snap.data()?.recipientUid||'') !== recipientUid) throw economyError('TRADE_NOTIFICATION_NOT_FOUND');
  const nowMs = Date.now();
  await ref.set({ readAtMs:nowMs }, { merge:true });
  return { notificationId:id, readAtMs:nowMs };
}

export async function getCommunityAdminDashboard(db) {
  const [policy, bansSnap, casesSnap] = await Promise.all([
    loadCommunityModerationPolicy(db), db.collection('communityBans').limit(100).get(), db.collection('communityCases').limit(150).get()
  ]);
  const nowMs = Date.now();
  const bans = bansSnap.docs.map(row => activeBanFromData(row.id,row.data(),nowMs)).filter(Boolean).sort((a,b)=>(b.updatedAtMs||0)-(a.updatedAtMs||0));
  const cases = casesSnap.docs.map(row => sanitizeCaseForAdmin(row.data())).sort((a,b)=>b.createdAtMs-a.createdAtMs).slice(0,100);
  return { policy, bans, cases };
}

export async function resolveCommunityCaseAdmin(db, { caseId, response, moderatorUid }) {
  const id = cleanCaseId(caseId);
  const cleanResponse = cleanText(response, 1000, 'COMMUNITY_CASE_RESPONSE_INVALID');
  const ref = db.doc(`communityCases/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw economyError('COMMUNITY_CASE_NOT_FOUND');
  const nowMs = Date.now();
  await ref.set({ status:'resolved', response:cleanResponse, responderUid:String(moderatorUid||''), resolvedAtMs:nowMs, updatedAtMs:nowMs, resolvedAt:Timestamp.fromMillis(nowMs), updatedAt:Timestamp.fromMillis(nowMs) }, { merge:true });
  await writeAudit(db, { type:'case.resolve', moderatorUid, targetUid:String(snap.data()?.reporterUid||''), caseId:id });
  return sanitizeCaseForAdmin({ ...snap.data(), status:'resolved', response:cleanResponse, responderUid:String(moderatorUid||''), resolvedAtMs:nowMs, updatedAtMs:nowMs });
}
