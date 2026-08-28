// js/multiplayerReliability.js — Entrega 23.19.1 Multiplayer Reliability Hardening
//
// Núcleo PURO de confiabilidad para el transporte multiplayer. No importa Firebase ni DOM:
// puede usarse tanto en runtime como en los laboratorios Node. Sus responsabilidades son:
//   - ordenar snapshots mediante una revisión global monotónica del documento;
//   - recuperar cambios coalescidos cuando Firestore salta revisiones intermedias;
//   - distinguir ecos propios de cambios remotos acumulados;
//   - definir retry/backoff de publicaciones transitorias;
//   - validar que un reconnect público/privado pertenezca al mismo commit atómico;
//   - clasificar la presencia del rival a partir del heartbeat compartido.

export const MULTIPLAYER_RELIABILITY_VERSION = '23.19.1';
export const SYNC_RETRY_MAX_ATTEMPTS = 3;
export const SYNC_RECOVERY_RETRY_MS = 5000;
export const MULTIPLAYER_READY_TIMEOUT_MS = 300000;
export const RIVAL_PRESENCE_STALE_MS = 65000;

function sessionEntropy() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(3);
      crypto.getRandomValues(buf);
      return [...buf].map(n => n.toString(36)).join('');
    }
  } catch {}
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

// 23.19.1 — identidad por INSTANCIA de navegador, no por cuenta. Dos pestañas con el
// mismo uid comparten rol/auth, pero no comparten este nonce. El lobby sigue impidiendo
// ocupar host+guest con la misma cuenta; este fencing cubre el caso distinto de dos clientes
// vivos intentando controlar EL MISMO rol después de duplicar/reabrir/reconectar.
export const MULTIPLAYER_CLIENT_SESSION_ID = `mps_${sessionEntropy()}`;

export function roleSessionField(role) {
  if (role === 'host') return 'hostSessionId';
  if (role === 'guest') return 'guestSessionId';
  throw new Error('MULTIPLAYER_ROLE_INVALID');
}

export function validateRoleSession(publicDoc, role, sessionId = MULTIPLAYER_CLIENT_SESSION_ID) {
  if (!publicDoc || !sessionId) return { ok:false, reason:'session_missing', expected:null, actual:sessionId || null };
  const field = roleSessionField(role);
  const expected = String(publicDoc[field] || '');
  const actual = String(sessionId || '');
  if (!expected) return { ok:false, reason:'session_unclaimed', expected:null, actual };
  if (expected !== actual) return { ok:false, reason:'session_superseded', expected, actual };
  return { ok:true, reason:null, expected, actual };
}

// Reconnect no intenta fingir continuidad cuando el proceso JS murió en medio de una
// decisión remota publicada. El board/Stack normal sí es rehidratable; los resolvers de
// Promise de pendingDecision/decisionResponse no lo son. En ese borde preferimos fallar
// cerrado y explicar el estado antes que continuar una resolución truncada.
export function classifyReconnectSafety(publicDoc, role = null) {
  if (!publicDoc || typeof publicDoc !== 'object') return { ok:false, reason:'missing_public_state' };
  const marker = publicDoc.multiplayerResolutionMarker;
  if (marker && (!role || marker.authorityRole === role)) {
    return { ok:false, reason:'resolution_authority_process_lost', kind:marker.kind || null, stackId:marker.stackId || null };
  }
  if (publicDoc.pendingDecision) {
    const forRole = publicDoc.pendingDecision.forRole || null;
    // Si la pregunta está dirigida A la pestaña que vuelve, el requester vive en el rival
    // y el listener nuevo puede contestarla. Lo irrecuperable es volver como requester:
    // su Promise/resolver murió junto con el proceso JS anterior.
    if (role && forRole === role && !publicDoc.decisionResponse) {
      return { ok:true, reason:null, resumableDecision:true, requestId:publicDoc.pendingDecision.requestId || null, type:publicDoc.pendingDecision.type || null };
    }
    return { ok:false, reason:'remote_decision_requester_lost', requestId:publicDoc.pendingDecision.requestId || null, type:publicDoc.pendingDecision.type || null, forRole };
  }
  if (publicDoc.decisionResponse) return { ok:false, reason:'remote_decision_response_pending', requestId:publicDoc.decisionResponse.requestId || null, type:publicDoc.decisionResponse.type || null };
  if (Number(publicDoc.consecutivePasses || 0) >= 2) return { ok:false, reason:'resolution_boundary_in_progress' };
  return { ok:true, reason:null };
}

const TRANSPORT_ONLY_KEYS = new Set([
  'syncMeta', 'syncRevision', 'syncFieldRevisions', 'hostPrivateRevision', 'guestPrivateRevision',
  'hostLastSeenAt', 'guestLastSeenAt', 'hostSessionId', 'guestSessionId', 'updatedAt', 'createdAt'
]);

export function normalizeSyncRevision(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function stableValue(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    const out = value.map(v => stableValue(v, seen));
    seen.delete(value);
    return out;
  }
  const out = {};
  Object.keys(value).sort().forEach(key => {
    const v = value[key];
    if (v !== undefined && typeof v !== 'function') out[key] = stableValue(v, seen);
  });
  seen.delete(value);
  return out;
}

export function syncWireStringify(value) {
  try { return JSON.stringify(stableValue(value)); }
  catch { try { return JSON.stringify(value); } catch { return String(value); } }
}

export function syncWireEqual(a, b) {
  return syncWireStringify(a) === syncWireStringify(b);
}

export function changedDocumentKeys(nextDoc, baseline, options = {}) {
  if (!nextDoc || typeof nextDoc !== 'object' || !baseline || typeof baseline !== 'object') return new Set();
  const exclude = new Set(options.excludeKeys || []);
  const keys = new Set([...Object.keys(nextDoc), ...Object.keys(baseline)]);
  const changed = new Set();
  keys.forEach(key => {
    if (exclude.has(key)) return;
    if (!syncWireEqual(nextDoc[key], baseline[key])) changed.add(key);
  });
  return changed;
}

// Firestore entrega el documento mergeado COMPLETO aunque syncMeta describa sólo el último
// write. Si el listener recibe rev 12 después de rev 10, rev 12 ya contiene también lo que
// cambió en rev 11. Por eso para snapshots remotos hacemos UNION entre touchedKeys declarado
// y el delta real contra el último documento observado. Así podemos descartar luego rev 11
// sin perder ninguna key acumulada.
export function deriveEffectiveTouchedKeys({ publicDoc, baseline, declaredTouchedKeys, isSelfEcho = false } = {}) {
  const declared = declaredTouchedKeys == null
    ? null
    : new Set(declaredTouchedKeys instanceof Set ? [...declaredTouchedKeys] : declaredTouchedKeys);

  if (!baseline || typeof baseline !== 'object') {
    return {
      effectiveTouchedKeys: isSelfEcho ? new Set() : declared,
      documentDeltaKeys: new Set(),
      coalescedRemoteKeys: new Set()
    };
  }

  const documentDeltaKeys = changedDocumentKeys(publicDoc, baseline, { excludeKeys: ['syncMeta'] });

  if (isSelfEcho) {
    const coalescedRemoteKeys = new Set();
    documentDeltaKeys.forEach(key => {
      if (TRANSPORT_ONLY_KEYS.has(key)) return;
      if (!declared || !declared.has(key)) coalescedRemoteKeys.add(key);
    });
    return { effectiveTouchedKeys: coalescedRemoteKeys, documentDeltaKeys, coalescedRemoteKeys };
  }

  // Documento legacy sin touchedKeys: mantener compatibilidad histórica = aplicar todo.
  if (!declared) return { effectiveTouchedKeys: null, documentDeltaKeys, coalescedRemoteKeys: new Set() };

  const effectiveTouchedKeys = new Set(declared);
  documentDeltaKeys.forEach(key => {
    if (!TRANSPORT_ONLY_KEYS.has(key)) effectiveTouchedKeys.add(key);
  });
  return { effectiveTouchedKeys, documentDeltaKeys, coalescedRemoteKeys: new Set() };
}

export function classifySnapshotRevision(incomingRevision, lastAppliedRevision) {
  const incoming = normalizeSyncRevision(incomingRevision);
  const last = normalizeSyncRevision(lastAppliedRevision);
  if (incoming < last) return { kind: 'stale', incoming, last, gap: 0 };
  if (incoming === last) return { kind: 'same', incoming, last, gap: 0 };
  return { kind: 'new', incoming, last, gap: Math.max(0, incoming - last - 1) };
}

export function privateRevisionField(role) {
  if (role === 'host') return 'hostPrivateRevision';
  if (role === 'guest') return 'guestPrivateRevision';
  throw new Error('MULTIPLAYER_ROLE_INVALID');
}

export function validateReconnectRevisionPair(publicDoc, privateDoc, role) {
  if (!publicDoc || !privateDoc) return { ok: false, reason: 'missing_document', expected: null, actual: null };
  const field = privateRevisionField(role);
  const expected = normalizeSyncRevision(publicDoc[field]);
  const actual = normalizeSyncRevision(privateDoc._syncRevision);
  if (expected <= 0) return { ok: false, reason: 'public_private_revision_missing', expected, actual };
  if (actual <= 0) return { ok: false, reason: 'private_revision_missing', expected, actual };
  if (expected !== actual) return { ok: false, reason: 'revision_mismatch', expected, actual };
  return { ok: true, reason: null, expected, actual };
}

export function syncRetryDelayMs(attempt) {
  const index = Math.max(1, Math.floor(Number(attempt) || 1)) - 1;
  return [300, 750, 1500][Math.min(index, 2)];
}

export function isRetryableSyncError(error) {
  const raw = String(error?.code || error?.name || '').toLowerCase();
  const code = raw.includes('/') ? raw.split('/').pop() : raw;
  return new Set(['aborted', 'cancelled', 'deadline-exceeded', 'internal', 'resource-exhausted', 'unavailable', 'unknown']).has(code);
}

export function timestampToMs(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') {
    const ms = Number(value.toMillis());
    return Number.isFinite(ms) ? ms : null;
  }
  const seconds = Number(value.seconds);
  if (Number.isFinite(seconds)) {
    const nanos = Number(value.nanoseconds || 0);
    return seconds * 1000 + (Number.isFinite(nanos) ? nanos / 1e6 : 0);
  }
  const direct = Number(value);
  return Number.isFinite(direct) ? direct : null;
}

export function classifyRivalPresence(lastSeenValue, nowMs = Date.now(), staleAfterMs = RIVAL_PRESENCE_STALE_MS) {
  const lastSeenMs = timestampToMs(lastSeenValue);
  if (!Number.isFinite(lastSeenMs)) return { status: 'unknown', ageMs: null, lastSeenMs: null };
  const ageMs = Math.max(0, Number(nowMs) - lastSeenMs);
  return {
    status: ageMs > Math.max(1000, Number(staleAfterMs) || RIVAL_PRESENCE_STALE_MS) ? 'stale' : 'healthy',
    ageMs,
    lastSeenMs
  };
}

export function normalizeFieldRevisionMap(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  Object.entries(value).forEach(([key, revision]) => {
    const n = normalizeSyncRevision(revision);
    if (n > 0) out[key] = n;
  });
  return out;
}

export function fieldRevisionDeltaKeys(fieldRevisions, lastApplied) {
  const normalized = normalizeFieldRevisionMap(fieldRevisions);
  const out = new Set();
  Object.entries(normalized).forEach(([key, revision]) => {
    const previous = lastApplied instanceof Map
      ? normalizeSyncRevision(lastApplied.get(key))
      : normalizeSyncRevision(lastApplied?.[key]);
    if (revision > previous && !TRANSPORT_ONLY_KEYS.has(key)) out.add(key);
  });
  return out;
}

export function markFieldRevisionsApplied(targetMap, fieldRevisions, keys = null) {
  if (!(targetMap instanceof Map)) throw new Error('FIELD_REVISION_TARGET_MAP_REQUIRED');
  const normalized = normalizeFieldRevisionMap(fieldRevisions);
  const allowed = keys == null ? null : new Set(keys instanceof Set ? [...keys] : keys);
  Object.entries(normalized).forEach(([key, revision]) => {
    if (allowed && !allowed.has(key)) return;
    const previous = normalizeSyncRevision(targetMap.get(key));
    if (revision > previous) targetMap.set(key, revision);
  });
  return targetMap;
}
