// js/rewardRevealRecovery.js — Entrega 23.13.67
// Journal local durable para la EXPERIENCIA de revelación de recompensas ya acreditadas.
// La economía sigue siendo Firestore-atómica; este módulo no otorga cartas ni toca Firebase.
// Su único objetivo es que F5/cierre/conexión perdida no haga desaparecer la identidad visual
// de una Mythic que ya fue consumida/acreditada.

export const PENDING_REWARD_REVEAL_STORAGE_KEY = 'argentinia.pendingRewardReveals.v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function safeReadAll() {
  try {
    const raw = localStorage.getItem(PENDING_REWARD_REVEAL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWriteAll(items) {
  try {
    localStorage.setItem(PENDING_REWARD_REVEAL_STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

function normalizeCardId(value) {
  return String(value || '').trim().slice(0, 160);
}

function normalizeUid(value) {
  return String(value || '').trim();
}

function copiesOf(collection, cardId) {
  if (!Array.isArray(collection) || !cardId) return 0;
  let count = 0;
  for (const id of collection) if (String(id) === cardId) count += 1;
  return count;
}

function prune(all, nowMs = Date.now()) {
  const now = Math.max(0, Number(nowMs) || Date.now());
  return all.filter(item => {
    const at = Math.max(0, Number(item?.createdAtMs) || 0);
    return at > 0 && now - at <= MAX_AGE_MS;
  });
}

export function beginGuaranteedMythicReveal(uid, cardId, profile = {}) {
  const ownerUid = normalizeUid(uid);
  const normalizedCardId = normalizeCardId(cardId);
  if (!ownerUid || !normalizedCardId) return null;

  const inventoryBefore = Math.max(0, Math.floor(Number(profile?.inventory?.guaranteedMythics) || 0));
  const collection = Array.isArray(profile?.collection) ? profile.collection : [];
  const entry = {
    uid: ownerUid,
    type: 'guaranteedMythic',
    cardId: normalizedCardId,
    status: 'prepared',
    inventoryBefore,
    collectionLengthBefore: collection.length,
    cardCopiesBefore: copiesOf(collection, normalizedCardId),
    createdAtMs: Date.now(),
    committedAtMs: null
  };

  const all = prune(safeReadAll()).filter(item => !(item?.uid === ownerUid && item?.type === 'guaranteedMythic'));
  all.push(entry);
  safeWriteAll(all.slice(-20));
  return entry;
}

export function getPendingGuaranteedMythicReveal(uid) {
  const ownerUid = normalizeUid(uid);
  if (!ownerUid) return null;
  const all = prune(safeReadAll());
  // Persistimos el prune por si había basura antigua.
  safeWriteAll(all);
  const item = [...all].reverse().find(entry => entry?.uid === ownerUid && entry?.type === 'guaranteedMythic');
  if (!item) return null;
  const cardId = normalizeCardId(item.cardId);
  if (!cardId) return null;
  return {
    ...item,
    uid: ownerUid,
    cardId,
    status: item.status === 'committed' ? 'committed' : 'prepared',
    inventoryBefore: Math.max(0, Math.floor(Number(item.inventoryBefore) || 0)),
    collectionLengthBefore: Math.max(0, Math.floor(Number(item.collectionLengthBefore) || 0)),
    cardCopiesBefore: Math.max(0, Math.floor(Number(item.cardCopiesBefore) || 0))
  };
}

export function markGuaranteedMythicRevealCommitted(uid, cardId) {
  const ownerUid = normalizeUid(uid);
  const normalizedCardId = normalizeCardId(cardId);
  if (!ownerUid || !normalizedCardId) return false;
  const all = prune(safeReadAll());
  let found = false;
  const next = all.map(item => {
    if (item?.uid !== ownerUid || item?.type !== 'guaranteedMythic' || normalizeCardId(item.cardId) !== normalizedCardId) return item;
    found = true;
    return { ...item, status: 'committed', committedAtMs: Date.now() };
  });
  safeWriteAll(next);
  return found;
}

export function clearPendingGuaranteedMythicReveal(uid, cardId = null) {
  const ownerUid = normalizeUid(uid);
  const normalizedCardId = cardId == null ? null : normalizeCardId(cardId);
  if (!ownerUid) return false;
  const all = prune(safeReadAll());
  return safeWriteAll(all.filter(item => {
    if (item?.uid !== ownerUid || item?.type !== 'guaranteedMythic') return true;
    if (normalizedCardId && normalizeCardId(item.cardId) !== normalizedCardId) return true;
    return false;
  }));
}

// Evidencia puramente local sobre un perfil ya leído. "committed" exige las TRES señales
// que produce la transacción: -1 item, +1 carta y +1 copia exacta del cardId elegido.
export function inferGuaranteedMythicRevealState(profile, pending) {
  if (!pending || pending.type !== 'guaranteedMythic') return 'none';
  if (pending.status === 'committed') return 'committed';
  const cardId = normalizeCardId(pending.cardId);
  const collection = Array.isArray(profile?.collection) ? profile.collection : [];
  const inventoryNow = Math.max(0, Math.floor(Number(profile?.inventory?.guaranteedMythics) || 0));
  const itemConsumed = inventoryNow <= Math.max(0, pending.inventoryBefore - 1);
  const collectionGrew = collection.length >= pending.collectionLengthBefore + 1;
  const exactCardGrew = copiesOf(collection, cardId) >= pending.cardCopiesBefore + 1;
  return itemConsumed && collectionGrew && exactCardGrew ? 'committed' : 'unconfirmed';
}
