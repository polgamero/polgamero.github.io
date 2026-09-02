// js/economyRevealRecovery.js — v23.19.5.1
// Journal local mínimo para operaciones de Cofre server-authoritative.
// Guarda operationId ANTES del callable. Nunca guarda autoridad económica ni decide cartas.

export const ECONOMY_REVEAL_STORAGE_KEY = 'argentinia.economyRevealRecovery.v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const VALID_TYPES = new Set(['pack', 'guaranteedMythic']);

function safeRead() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ECONOMY_REVEAL_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function safeWrite(items) {
  try {
    localStorage.setItem(ECONOMY_REVEAL_STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch { return false; }
}
function cleanText(value, max = 160) { return String(value || '').trim().slice(0, max); }
function prune(items, now = Date.now()) {
  return items.filter(item => {
    const at = Math.max(0, Number(item?.createdAtMs) || 0);
    return at > 0 && now - at <= MAX_AGE_MS;
  });
}


export function createEconomyRevealOperationId(type) {
  const kind = VALID_TYPES.has(String(type || '')) ? String(type) : 'pack';
  const prefix = kind === 'guaranteedMythic' ? 'mythic' : 'pack';
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${random}`.slice(0, 128);
}

export function beginEconomyReveal(uid, type, operationId) {
  const ownerUid = cleanText(uid, 256);
  const kind = cleanText(type, 40);
  const op = cleanText(operationId, 128);
  if (!ownerUid || !VALID_TYPES.has(kind) || !op) return null;
  const all = prune(safeRead()).filter(item => !(item?.uid === ownerUid && item?.type === kind));
  const entry = { uid: ownerUid, type: kind, operationId: op, createdAtMs: Date.now() };
  all.push(entry);
  safeWrite(all.slice(-20));
  return entry;
}

export function getPendingEconomyReveal(uid, type) {
  const ownerUid = cleanText(uid, 256);
  const kind = cleanText(type, 40);
  if (!ownerUid || !VALID_TYPES.has(kind)) return null;
  const all = prune(safeRead());
  safeWrite(all);
  const item = [...all].reverse().find(entry => entry?.uid === ownerUid && entry?.type === kind);
  if (!item) return null;
  const operationId = cleanText(item.operationId, 128);
  return operationId ? { ...item, operationId } : null;
}

export function clearPendingEconomyReveal(uid, type, operationId = null) {
  const ownerUid = cleanText(uid, 256);
  const kind = cleanText(type, 40);
  const op = operationId == null ? null : cleanText(operationId, 128);
  if (!ownerUid || !VALID_TYPES.has(kind)) return false;
  const all = prune(safeRead());
  return safeWrite(all.filter(item => {
    if (item?.uid !== ownerUid || item?.type !== kind) return true;
    if (op && cleanText(item.operationId, 128) !== op) return true;
    return false;
  }));
}
