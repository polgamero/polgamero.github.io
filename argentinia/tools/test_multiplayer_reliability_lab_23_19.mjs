#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  deriveEffectiveTouchedKeys,
  classifySnapshotRevision,
  validateReconnectRevisionPair,
  fieldRevisionDeltaKeys,
  markFieldRevisionsApplied,
  SYNC_RETRY_MAX_ATTEMPTS
} from '../js/multiplayerReliability.js';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const manifest = JSON.parse(read('build-manifest.json'));
const version = read('js/version.js');
const main = read('js/main.js');
const fb = read('js/firebaseClientImpl.js');
const facade = read('js/firebaseClient.js');
const texts = read('js/gameTexts.js');
const utils = read('js/utils.js');

assert.equal(manifest.engineVersion, '23.19.4.4');
assert.equal(manifest.engineProtocolVersion, 'mp-23.19.1');
assert.equal(manifest.protocolVersion, 'mp-23.19.1');
assert.equal(manifest.firestoreRulesVersion, '23.13.79');
assert.equal(manifest.pool, 880);
assert.match(version, /ENGINE_VERSION = '23\.19\.4\.4'/);
assert.match(version, /ENGINE_PROTOCOL_VERSION = 'mp-23\.19\.1'/);

assert.match(fb, /export async function publishMatchStateAtomic/);
assert.match(fb, /syncRevision: nextRevision/);
assert.match(fb, /syncFieldRevisions: nextFieldRevisions/);
assert.match(fb, /serverRevision: nextRevision/);
assert.match(fb, /tx\.set\(privateRef, privateWrite/);
assert.match(fb, /validateReconnectRevisionPair/);
assert.match(
  fb,
  /runTransaction\(db, async tx => \{[\s\S]{0,700}publicSnap = await tx\.get\(publicRef\)[\s\S]{0,500}privateSnap = await tx\.get\(privateRef\)/
);
assert.match(facade, /publishMatchStateAtomic = asyncProxy/);

assert.match(main, /fieldRevisionDeltaKeys/);
assert.match(main, /markFieldRevisionsApplied/);
assert.match(main, /sync_stale_revision_ignored/);
assert.match(main, /sync_revision_gap_recovered/);
assert.match(main, /sync_publish_retry_scheduled/);
assert.match(main, /SYNC_RETRY_MAX_ATTEMPTS/);
assert.match(main, /multiplayer_presence_stale/);
assert.match(main, /multiplayer_presence_restored/);
assert.ok(!main.includes('writes.push(publishMyPublicState'));
assert.match(texts, /multiplayer\.connection\.stale/);
assert.match(texts, /multiplayer\.connection\.restored/);

// 23.19 — Deck Intelligence Privacy Guard. El mazo del Tano es información oculta:
// ningún log/diagnóstico casual debe publicar identidad, arquetipo o score al jugador.
assert.ok(!/console\.(?:log|info|debug|warn)\s*\([\s\S]{0,260}Deck Intelligence/i.test(utils),
  'Deck Intelligence must not print generated deck details to the browser console');
assert.ok(!/rival_deck_ready[^\n]{0,240}archetype/.test(main),
  'mobile runtime diagnostics must not expose the Tano archetype');
assert.ok(main.includes('const initialSyncConfirmed = await publishMatchState({ force: true });'),
  'multiplayer ready barrier must explicitly await a confirmed initial atomic publish');
assert.ok(main.includes("throw new Error('MULTIPLAYER_INITIAL_SYNC_NOT_CONFIRMED')"),
  'multiplayer ready barrier must fail closed when initial sync is not confirmed');

// Fallback legacy: sin field revisions, una revisión salteada recupera el delta acumulado.
const base = { syncRevision: 3, a: 1, b: 1, syncMeta: { writerRole: 'guest', writerClientId: 'g', touchedKeys: ['b'] } };
const next = { syncRevision: 5, a: 2, b: 2, syncMeta: { writerRole: 'guest', writerClientId: 'g', touchedKeys: ['b'] } };
const d = deriveEffectiveTouchedKeys({
  publicDoc: next,
  baseline: base,
  declaredTouchedKeys: new Set(['b']),
  isSelfEcho: false
});
assert.deepEqual([...d.effectiveTouchedKeys].sort(), ['a', 'b']);

// Garantía 23.19: revisiones por campo detectan cambios remotos aun si el baseline del
// documento ya avanzó por un eco propio anterior.
const applied = new Map([['a', 4], ['b', 5]]);
const fieldRevisions = { a: 7, b: 5, c: 6 };
assert.deepEqual([...fieldRevisionDeltaKeys(fieldRevisions, applied)].sort(), ['a', 'c']);
markFieldRevisionsApplied(applied, fieldRevisions, new Set(['a']));
assert.equal(applied.get('a'), 7);
assert.equal(applied.get('c'), undefined);

assert.equal(classifySnapshotRevision(4, 5).kind, 'stale');
assert.equal(classifySnapshotRevision(8, 5).gap, 2);
assert.equal(validateReconnectRevisionPair({ hostPrivateRevision: 7 }, { _syncRevision: 7 }, 'host').ok, true);
assert.equal(validateReconnectRevisionPair({ hostPrivateRevision: 7 }, { _syncRevision: 6 }, 'host').ok, false);
assert.equal(SYNC_RETRY_MAX_ATTEMPTS, 3);

const lab = path.join(root, 'tools/run_multiplayer_reliability_lab_23_19.mjs');
const { stdout } = await execFileAsync(process.execPath, [lab, '--seeds', '120', '--commits', '90'], {
  timeout: 30000,
  maxBuffer: 4 * 1024 * 1024
});
assert.match(stdout, /MULTIPLAYER_RELIABILITY_LAB_23_19_OK/);
assert.match(stdout, /tornReconnectsRejected=/);
assert.match(stdout, /coalescedKeysRecovered=/);

console.log('MULTIPLAYER_RELIABILITY_23_19_OK atomic=PASS fieldRevisions=PASS revisionGate=PASS cumulativeFallback=PASS reconnect=PASS retry=PASS presence=PASS deckPrivacy=PASS lab=PASS');
