// js/gameRewards.js — Entrega 23.19.5.4 · server-authoritative Reward Settlement recovery journal
// Cola local mínima y sin Firebase para premios de fin de partida.
// Se escribe SINCRÓNICAMENTE antes de disparar la transacción remota: si la pestaña muere,
// el próximo login puede reintentar el mismo receipt sin duplicar puntos.

export const PENDING_GAME_REWARDS_STORAGE_KEY = 'argentinia.pendingGameRewards.v1';

export function normalizeGameRewardReceiptId(value) {
  return String(value || '')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 240);
}

function safeReadAll() {
  try {
    const raw = localStorage.getItem(PENDING_GAME_REWARDS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWriteAll(items) {
  try {
    localStorage.setItem(PENDING_GAME_REWARDS_STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function queuePendingGameReward(uid, reward = {}) {
  const ownerUid = String(uid || '');
  const receiptId = normalizeGameRewardReceiptId(reward.receiptId);
  const baseDelta = Math.max(0, Math.floor(Number(reward.baseDelta) || 0));
  if (!ownerUid || !receiptId || baseDelta <= 0) return null;
  const normalized = {
    uid: ownerUid,
    receiptId,
    // baseDelta queda sólo como metadata legacy/UX. Functions 23.19.5.4 lo ignora y
    // reconstruye el premio desde gameConfig + evidencia de partida.
    baseDelta,
    operationId: String(reward.operationId || `match-reward:${receiptId}`).slice(0, 128),
    mode: reward.mode === 'multiplayer' ? 'multiplayer' : 'solo',
    outcome: reward.outcome === 'loss' ? 'loss' : 'win',
    // 23.19.2 — la dificultad forma parte de la evidencia durable para que Rules pueda
    // validar el premio Solo contra gameConfig. Pendientes legacy no la tienen y siguen
    // siendo recuperables por compatibilidad server-side.
    difficulty: reward.mode === 'multiplayer'
      ? ''
      : (['easy','medium','hard'].includes(String(reward.difficulty || '').toLowerCase())
          ? String(reward.difficulty).toLowerCase()
          : ''),
    matchId: reward.mode === 'multiplayer' ? String(reward.matchId || '') : '',
    myRole: reward.mode === 'multiplayer' && reward.myRole === 'guest' ? 'guest' : (reward.mode === 'multiplayer' ? 'host' : ''),
    // 23.19.5.5 — stat-only evidence for server-owned Solo duration. Never participates in
    // reward amount/digest; old pending entries without it remain valid and normalize to 0.
    durationMs: reward.mode === 'multiplayer' ? 0 : Math.max(0, Math.min(24 * 60 * 60 * 1000, Math.floor(Number(reward.durationMs) || 0))),
    queuedAtMs: Math.max(0, Math.floor(Number(reward.queuedAtMs) || Date.now()))
  };
  const all = safeReadAll();
  const key = `${ownerUid}|${receiptId}`;
  const next = all.filter(item => `${item?.uid || ''}|${item?.receiptId || ''}` !== key);
  next.push(normalized);
  safeWriteAll(next.slice(-40));
  return normalized;
}

export function pendingGameRewardsForUid(uid) {
  const ownerUid = String(uid || '');
  return safeReadAll().filter(item => item?.uid === ownerUid && normalizeGameRewardReceiptId(item?.receiptId));
}

export function removePendingGameReward(uid, receiptId) {
  const ownerUid = String(uid || '');
  const normalizedReceipt = normalizeGameRewardReceiptId(receiptId);
  const all = safeReadAll();
  return safeWriteAll(all.filter(item => !(item?.uid === ownerUid && normalizeGameRewardReceiptId(item?.receiptId) === normalizedReceipt)));
}
