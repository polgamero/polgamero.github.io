// js/replayKernel.js — Argentinia 23.18 Stability & Replay Foundation
// Kernel puro para reconstrucción event-sourced, hashes estables y auditoría de replays.
// No importa main.js, DOM ni Firebase: también corre en Node.

export const REPLAY_FORMAT_VERSION = 1;
export const REPLAY_HASH_ALGORITHM = 'fnv1a32-stable-json-v1';

function stableNormalize(value, seen = new WeakSet()) {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (Array.isArray(value)) return value.map(v => stableNormalize(v, seen));
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stableNormalize(value[key], seen);
  seen.delete(value);
  return out;
}

export function stableReplayStringify(value) {
  return JSON.stringify(stableNormalize(value));
}

export function replayHash(value) {
  const text = stableReplayStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a32:${h.toString(16).padStart(8, '0')}`;
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function setPath(root, path, value) {
  if (!path || path === '$') return clone(value);
  const parts = String(path).split('.').filter(Boolean);
  let cursor = root && typeof root === 'object' ? root : {};
  const targetRoot = cursor;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  const last = parts[parts.length - 1];
  if (value === undefined) delete cursor[last];
  else cursor[last] = clone(value);
  return targetRoot;
}

export function applyReplayChanges(snapshot, changes = []) {
  let next = clone(snapshot) ?? null;
  for (const change of changes || []) {
    if (!change || change.truncated) continue;
    next = setPath(next, change.path, change.after);
  }
  return next;
}

export function replayStateChangeEvents(events = [], targetSeq = Infinity) {
  let snapshot = null;
  const checkpoints = [];
  const hashMismatches = [];
  for (const event of events || []) {
    const seq = Number(event?.seq || 0);
    if (seq > targetSeq) break;
    if (event?.type !== 'state_change') continue;
    const expectedBefore = event?.data?.beforeHash || null;
    if (expectedBefore && snapshot !== null) {
      const actualBefore = replayHash(snapshot);
      if (actualBefore !== expectedBefore) hashMismatches.push({ seq, side: 'before', expected: expectedBefore, actual: actualBefore });
    }
    snapshot = applyReplayChanges(snapshot, event?.data?.changes || []);
    const actualAfter = snapshot == null ? null : replayHash(snapshot);
    const expectedAfter = event?.data?.afterHash || null;
    if (expectedAfter && actualAfter !== expectedAfter) hashMismatches.push({ seq, side: 'after', expected: expectedAfter, actual: actualAfter });
    checkpoints.push({ seq, reason: event?.data?.reason || null, hash: actualAfter, expectedHash: expectedAfter });
  }
  return { snapshot, checkpoints, hashMismatches };
}

export function findReplayBugMarkers(payload = {}) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  return events.filter(ev => ev?.type === 'manual_bug_marker').map((ev, index) => ({
    marker: index + 1,
    seq: Number(ev.seq || 0),
    at: ev.at || null,
    note: ev?.data?.note || '(sin descripción)',
    replay: ev?.data?.replay || null
  }));
}

const REPLAY_ACTION_TYPES = new Set([
  'starting_player_selected', 'ui_click', 'ui_key', 'priority_pass', 'advance_step_requested',
  'phase_committed', 'cast_transaction_begin', 'cast_cost_locked', 'cast_transaction_committed',
  'blockers_declared', 'private_zone_commit', 'remote_decision_response_sent',
  'remote_decision_response_received', 'stack_push', 'stack_resolve_start', 'stack_resolve_end'
]);

export function buildReplayActionJournal(events = []) {
  return (events || []).filter(ev => REPLAY_ACTION_TYPES.has(ev?.type)).map(ev => ({
    seq: Number(ev.seq || 0),
    at: ev.at || null,
    relativeMs: Number(ev.relativeMs || 0),
    type: ev.type,
    data: clone(ev.data || {})
  }));
}

export function snapshotInvariantFindings(snapshot) {
  const findings = [];
  const add = (code, details = {}) => findings.push({ code, details });
  if (!snapshot || typeof snapshot !== 'object') {
    add('SNAPSHOT_MISSING');
    return findings;
  }
  const turn = snapshot.turn || {};
  if (!Number.isInteger(turn.turnCount) || turn.turnCount < 1) add('INVALID_TURN_COUNT', { value: turn.turnCount });
  if (!['local', 'rival'].includes(turn.activePlayer)) add('INVALID_ACTIVE_PLAYER', { value: turn.activePlayer });
  if (!['local', 'rival'].includes(turn.priorityPlayer)) add('INVALID_PRIORITY_PLAYER', { value: turn.priorityPlayer });
  if (!Number.isInteger(turn.consecutivePasses) || turn.consecutivePasses < 0 || turn.consecutivePasses > 2) add('INVALID_PASS_COUNT', { value: turn.consecutivePasses });
  for (const side of ['local', 'rival']) {
    const s = snapshot[side] || {};
    if (!Number.isFinite(s.hp)) add('INVALID_HP', { side, value: s.hp });
    if (!Number.isFinite(s.poison) || s.poison < 0) add('INVALID_POISON', { side, value: s.poison });
    const pool = s.manaPool || {};
    for (const color of ['W','U','B','R','G','C']) {
      if (!Number.isInteger(pool[color]) || pool[color] < 0) add('INVALID_MANA', { side, color, value: pool[color] });
    }
  }
  const stack = snapshot.stack;
  if (!Array.isArray(stack)) add('STACK_NOT_ARRAY');
  else {
    const ids = new Set();
    for (const item of stack) {
      if (item?.id == null) continue;
      if (ids.has(item.id)) add('DUPLICATE_STACK_ID', { id: item.id });
      ids.add(item.id);
    }
  }
  return findings;
}

export function auditTelemetryReplay(payload, options = {}) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const markers = findReplayBugMarkers(payload);
  const markerNumber = Math.max(1, Math.floor(Number(options.marker || markers.length || 1)));
  const marker = markers[markerNumber - 1] || null;
  const targetSeq = Number(options.seq || marker?.seq || events.at(-1)?.seq || Infinity);
  const rebuilt = replayStateChangeEvents(events, targetSeq);
  return {
    formatVersion: payload?.replay?.formatVersion || 0,
    telemetryVersion: payload?.telemetryVersion || null,
    targetSeq,
    marker,
    markers,
    reconstructedHash: rebuilt.snapshot ? replayHash(rebuilt.snapshot) : null,
    hashMismatches: rebuilt.hashMismatches,
    invariantFindings: snapshotInvariantFindings(rebuilt.snapshot),
    snapshot: rebuilt.snapshot,
    actionJournal: buildReplayActionJournal(events.filter(ev => Number(ev?.seq || 0) <= targetSeq))
  };
}

export const __replayKernelTest = { stableNormalize, setPath, REPLAY_ACTION_TYPES };
