// js/economyActionRecovery.js — v23.19.5.2
// Journal local de intención para mutaciones económicas server-authoritative no-cinemáticas.
// Guarda sólo uid/tipo/operationId/requestKey. Nunca guarda saldo, cartas ni autoridad.

export const ECONOMY_ACTION_STORAGE_KEY = 'argentinia.economyActionRecovery.v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const VALID_TYPES = new Set([
  'packPurchase','enhancementCraft','prebuiltPurchase','classifiedPurchase','usernameRename'
]);

function safeRead() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ECONOMY_ACTION_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function safeWrite(items) {
  try { localStorage.setItem(ECONOMY_ACTION_STORAGE_KEY, JSON.stringify(items)); return true; }
  catch { return false; }
}
function clean(value, max=256){ return String(value || '').trim().slice(0,max); }
function prune(items, now=Date.now()) {
  return items.filter(item => {
    const at = Math.max(0, Number(item?.createdAtMs) || 0);
    return at > 0 && now - at <= MAX_AGE_MS;
  });
}
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export function economyActionRequestKey(request = {}) {
  const text = canonical(request);
  let h = 0x811c9dc5;
  for (let i=0;i<text.length;i++){ h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8,'0');
}
export function beginEconomyAction(uid, type, operationId, request = {}) {
  const ownerUid=clean(uid), kind=clean(type,48), op=clean(operationId,128);
  if (!ownerUid || !VALID_TYPES.has(kind) || !op) return null;
  const requestKey=economyActionRequestKey(request);
  const all=prune(safeRead()).filter(item=>!(item?.uid===ownerUid && item?.type===kind && item?.requestKey===requestKey));
  const entry={uid:ownerUid,type:kind,operationId:op,requestKey,createdAtMs:Date.now()};
  all.push(entry); safeWrite(all.slice(-40)); return entry;
}
export function getPendingEconomyAction(uid, type, request = {}) {
  const ownerUid=clean(uid), kind=clean(type,48);
  if (!ownerUid || !VALID_TYPES.has(kind)) return null;
  const requestKey=economyActionRequestKey(request);
  const all=prune(safeRead()); safeWrite(all);
  const item=[...all].reverse().find(entry=>entry?.uid===ownerUid && entry?.type===kind && entry?.requestKey===requestKey);
  if (!item) return null;
  const operationId=clean(item.operationId,128);
  return operationId ? {...item,operationId} : null;
}
export function clearPendingEconomyAction(uid, type, request = {}, operationId = null) {
  const ownerUid=clean(uid), kind=clean(type,48), requestKey=economyActionRequestKey(request), op=operationId==null?null:clean(operationId,128);
  if (!ownerUid || !VALID_TYPES.has(kind)) return false;
  const all=prune(safeRead());
  return safeWrite(all.filter(item=>{
    if(item?.uid!==ownerUid || item?.type!==kind || item?.requestKey!==requestKey) return true;
    if(op && clean(item.operationId,128)!==op) return true;
    return false;
  }));
}
