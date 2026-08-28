#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  classifySnapshotRevision,
  fieldRevisionDeltaKeys,
  markFieldRevisionsApplied,
  normalizeSyncRevision,
  privateRevisionField,
  validateReconnectRevisionPair,
  syncRetryDelayMs,
  isRetryableSyncError
} from '../js/multiplayerReliability.js';

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}
const seeds = Math.max(1, Math.floor(Number(argValue('--seeds', 500)) || 500));
const commitsPerSeed = Math.max(20, Math.floor(Number(argValue('--commits', 120)) || 120));

function hashSeed(input) {
  let h = 2166136261 >>> 0;
  for (const ch of String(input)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h || 1;
}
function rngFor(seed) {
  let a = hashSeed(seed) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function initialServer() {
  return {
    syncRevision: 0,
    syncFieldRevisions: {},
    hostPrivateRevision: 0,
    guestPrivateRevision: 0,
    hostHP: 20, guestHP: 20,
    hostHandCount: 7, guestHandCount: 7,
    turnCount: 1, phase: 'main1', activePlayer: 'host', priorityPlayer: 'host',
    consecutivePasses: 0, stackState: [], pendingDecision: null, decisionResponse: null,
    hostLands: [], guestLands: []
  };
}
function initialPrivate() {
  return {
    host: { hand: 7, deck: 53, _syncRevision: 0 },
    guest: { hand: 7, deck: 53, _syncRevision: 0 }
  };
}
function client(role, server) {
  return {
    role,
    clientId: `${role}_client`,
    publicView: clone(server),
    baseline: clone(server),
    lastRevision: 0,
    fieldRevisions: new Map(),
    writerSeq: 0,
    staleIgnored: 0,
    gapsRecovered: 0,
    coalescedRecovered: 0,
    duplicateOrSame: 0
  };
}
function publicGameplayKeys(doc) {
  const omit = new Set([
    'syncMeta', 'syncRevision', 'syncFieldRevisions',
    'hostPrivateRevision', 'guestPrivateRevision'
  ]);
  return Object.keys(doc).filter(k => !omit.has(k));
}

function commit(server, privates, writer, publicPatch, privatePatch = {}) {
  const next = normalizeSyncRevision(server.syncRevision) + 1;
  const touched = Object.keys(publicPatch);
  writer.writerSeq++;

  Object.assign(server, clone(publicPatch));
  server.syncRevision = next;
  server.syncFieldRevisions = { ...(server.syncFieldRevisions || {}) };
  for (const key of touched) server.syncFieldRevisions[key] = next;
  server.syncMeta = {
    writerRole: writer.role,
    writerClientId: writer.clientId,
    writerSeq: writer.writerSeq,
    publishId: `${writer.role}_${next}`,
    touchedKeys: touched,
    serverRevision: next
  };

  const privateKeys = Object.keys(privatePatch);
  if (privateKeys.length) {
    Object.assign(privates[writer.role], clone(privatePatch), { _syncRevision: next });
    server[privateRevisionField(writer.role)] = next;
  }

  // El runtime ya mutó localmente antes de publicar. El ACK de la transacción confirma
  // sólo las revisiones de las keys propias; si el transaction read vio revisiones ajenas,
  // ésas NO se marcan todavía y deben entrar luego por snapshot coalescida.
  Object.assign(writer.publicView, clone(publicPatch));
  markFieldRevisionsApplied(writer.fieldRevisions, server.syncFieldRevisions, touched);
  if (privateKeys.length) writer.publicView[privateRevisionField(writer.role)] = next;
  return clone(server);
}

function deliver(c, snapshot) {
  const rev = classifySnapshotRevision(snapshot.syncRevision, c.lastRevision);
  if (rev.kind === 'stale') { c.staleIgnored++; return; }
  if (rev.kind === 'same') c.duplicateOrSame++;
  if (rev.kind === 'new' && rev.gap > 0) c.gapsRecovered += rev.gap;

  const meta = snapshot.syncMeta || {};
  const touched = new Set(meta.touchedKeys || []);
  const self = meta.writerClientId === c.clientId || meta.writerRole === c.role;

  const revisionKeys = fieldRevisionDeltaKeys(snapshot.syncFieldRevisions, c.fieldRevisions);
  const effective = new Set(revisionKeys);
  if (self) {
    // Nunca rebobinar una key propia desde un eco del servidor: el state local puede haber
    // avanzado otra acción antes de que llegue este ACK. Las revisiones nuevas de otras
    // keys, en cambio, son cambios remotos coalescidos y deben aplicarse.
    for (const key of touched) effective.delete(key);
    markFieldRevisionsApplied(c.fieldRevisions, snapshot.syncFieldRevisions, touched);
    c.coalescedRecovered += effective.size;
  }

  for (const key of effective) {
    if (key in snapshot) c.publicView[key] = clone(snapshot[key]);
    else delete c.publicView[key];
  }
  markFieldRevisionsApplied(c.fieldRevisions, snapshot.syncFieldRevisions, effective);

  c.baseline = clone(snapshot);
  if (rev.kind === 'new') c.lastRevision = rev.incoming;
}

const totals = {
  seeds,
  commits: 0,
  deliveries: 0,
  dropped: 0,
  duplicates: 0,
  staleIgnored: 0,
  gapsRecovered: 0,
  coalescedRecovered: 0,
  reconnectChecks: 0,
  tornRejected: 0
};

for (let seedIndex = 0; seedIndex < seeds; seedIndex++) {
  const rnd = rngFor(`mp-rel-23.19-${seedIndex}`);
  const server = initialServer();
  const privates = initialPrivate();
  const host = client('host', server);
  const guest = client('guest', server);
  const clients = [host, guest];
  const queue = [];

  for (let i = 0; i < commitsPerSeed; i++) {
    const writer = clients[rnd() < 0.5 ? 0 : 1];
    const role = writer.role;
    const other = role === 'host' ? 'guest' : 'host';
    const selector = Math.floor(rnd() * 8);
    let patch = {};
    let privatePatch = {};

    if (selector === 0) patch[`${role}HP`] = Math.max(1, (server[`${role}HP`] || 20) - 1);
    else if (selector === 1) patch[`${other}HP`] = Math.max(1, (server[`${other}HP`] || 20) - 1);
    else if (selector === 2) {
      patch.priorityPlayer = server.priorityPlayer === 'host' ? 'guest' : 'host';
      patch.consecutivePasses = (server.consecutivePasses + 1) % 3;
    } else if (selector === 3) {
      patch.phase = server.phase === 'main1' ? 'combat' : server.phase === 'combat' ? 'main2' : 'main1';
    } else if (selector === 4) {
      patch.turnCount = server.turnCount + (server.phase === 'main2' ? 1 : 0);
      patch.activePlayer = server.activePlayer === 'host' ? 'guest' : 'host';
    } else if (selector === 5) {
      patch[`${role}HandCount`] = Math.max(0, (server[`${role}HandCount`] || 0) - 1);
      privatePatch = { hand: Math.max(0, privates[role].hand - 1), deck: privates[role].deck };
    } else if (selector === 6) {
      patch.stackState = [...(server.stackState || []), { id: `s${i}`, controllerRole: role }].slice(-4);
    } else {
      patch.pendingDecision = server.pendingDecision ? null : { requestId: `d${i}`, forRole: other, type: 'lab' };
    }

    const snap = commit(server, privates, writer, patch, privatePatch);
    totals.commits++;

    for (const c of clients) {
      if (rnd() < 0.12) { totals.dropped++; continue; }
      queue.push({ at: i + rnd() * 8, c, snapshot: snap });
      if (rnd() < 0.16) {
        queue.push({ at: i + rnd() * 12, c, snapshot: snap });
        totals.duplicates++;
      }
    }

    // Entregas parciales y desordenadas: algunos snapshots se pierden, otros se duplican
    // y otros llegan mucho después de revisiones más nuevas.
    queue.sort((a, b) => a.at - b.at);
    let budget = Math.floor(rnd() * 4);
    while (queue.length && queue[0].at <= i && budget-- > 0) {
      const d = queue.shift();
      deliver(d.c, d.snapshot);
      totals.deliveries++;
    }

    // Reconnect pairing: un par público/privado del mismo commit debe pasar; una lectura
    // privada artificialmente vieja debe ser rechazada como torn read.
    if (i % 17 === 0) {
      for (const roleCheck of ['host', 'guest']) {
        const good = validateReconnectRevisionPair(server, privates[roleCheck], roleCheck);
        if (normalizeSyncRevision(server[privateRevisionField(roleCheck)]) > 0) assert.equal(good.ok, true);
        totals.reconnectChecks++;
        if (normalizeSyncRevision(server[privateRevisionField(roleCheck)]) > 0) {
          const torn = { ...privates[roleCheck], _syncRevision: Math.max(0, privates[roleCheck]._syncRevision - 1) };
          const bad = validateReconnectRevisionPair(server, torn, roleCheck);
          assert.equal(bad.ok, false);
          totals.tornRejected++;
        }
      }
    }
  }

  // Una snapshot final completa debe recuperar toda revisión intermedia perdida. Luego
  // entregamos intencionalmente la cola vieja para comprobar que el gate global impide
  // cualquier rollback tardío.
  const latest = clone(server);
  for (const c of clients) { deliver(c, latest); totals.deliveries++; }
  queue.sort((a, b) => b.at - a.at);
  for (const d of queue) { deliver(d.c, d.snapshot); totals.deliveries++; }

  for (const c of clients) {
    for (const key of publicGameplayKeys(server)) {
      assert.ok(equal(c.publicView[key], server[key]), `seed ${seedIndex} ${c.role} diverged at ${key}`);
    }
    assert.equal(c.lastRevision, server.syncRevision, `seed ${seedIndex} ${c.role} revision`);
    totals.staleIgnored += c.staleIgnored;
    totals.gapsRecovered += c.gapsRecovered;
    totals.coalescedRecovered += c.coalescedRecovered;
  }
}

assert.deepEqual(
  [syncRetryDelayMs(1), syncRetryDelayMs(2), syncRetryDelayMs(3), syncRetryDelayMs(9)],
  [300, 750, 1500, 1500]
);
assert.equal(isRetryableSyncError({ code: 'unavailable' }), true);
assert.equal(isRetryableSyncError({ code: 'permission-denied' }), false);

console.log(
  `MULTIPLAYER_RELIABILITY_LAB_23_19_OK seeds=${totals.seeds} commits=${totals.commits} ` +
  `deliveries=${totals.deliveries} droppedIntermediate=${totals.dropped} duplicates=${totals.duplicates} ` +
  `staleIgnored=${totals.staleIgnored} revisionGapsRecovered=${totals.gapsRecovered} ` +
  `coalescedKeysRecovered=${totals.coalescedRecovered} reconnectChecks=${totals.reconnectChecks} ` +
  `tornReconnectsRejected=${totals.tornRejected}`
);
