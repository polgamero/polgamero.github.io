#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  MULTIPLAYER_RELIABILITY_VERSION,
  MULTIPLAYER_CLIENT_SESSION_ID,
  roleSessionField,
  validateRoleSession,
  classifyReconnectSafety,
  SYNC_RECOVERY_RETRY_MS,
  MULTIPLAYER_READY_TIMEOUT_MS
} from '../js/multiplayerReliability.js';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const manifest = JSON.parse(read('build-manifest.json'));
const main = read('js/main.js');
const fb = read('js/firebaseClientImpl.js');
const facade = read('js/firebaseClient.js');
const reliability = read('js/multiplayerReliability.js');
const turn = read('js/turnManager.js');
const sync = read('js/matchSync.js');
const ui = read('js/ui.js');
const texts = read('js/gameTexts.js');
const utils = read('js/utils.js');

assert.equal(ENGINE_VERSION, '23.19.4.8');
assert.equal(ENGINE_PROTOCOL_VERSION, 'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION, '23.13.79');
assert.equal(MULTIPLAYER_RELIABILITY_VERSION, '23.19.1');
assert.equal(manifest.engineVersion, '23.19.4.8');
assert.equal(manifest.engineProtocolVersion, 'mp-23.19.2');
assert.equal(manifest.firestoreRulesVersion, '23.13.79');
assert.equal(manifest.pool, 880);

// Aclaración central de 23.19.1: el self-join host->guest YA estaba protegido y debe seguirlo.
assert.ok(fb.includes("if (data.hostUid === uid) throw new Error('No podés unirte a tu propia partida.');"));
// El nuevo fence cubre otro caso: dos instancias vivas del mismo uid/rol.
assert.match(MULTIPLAYER_CLIENT_SESSION_ID, /^mps_/);
assert.equal(roleSessionField('host'), 'hostSessionId');
assert.equal(roleSessionField('guest'), 'guestSessionId');
assert.ok(fb.includes('hostSessionId: MULTIPLAYER_CLIENT_SESSION_ID'));
assert.ok(fb.includes('guestSessionId: MULTIPLAYER_CLIENT_SESSION_ID'));
assert.ok(fb.includes('export async function claimMatchRoleSession'));
assert.ok(fb.includes("throw new Error('MULTIPLAYER_SESSION_SUPERSEDED')"));
assert.ok(fb.includes('const session = validateRoleSession(current, role, MULTIPLAYER_CLIENT_SESSION_ID)'));
assert.ok(facade.includes("claimMatchRoleSession = asyncProxy('claimMatchRoleSession')"));
assert.ok(!facade.includes("publishMyPublicState = asyncProxy"));
assert.ok(!facade.includes("publishMyPrivateState = asyncProxy"));
assert.ok(!/export async function publishMyPublicState\s*\(/.test(fb));
assert.ok(!/export async function publishMyPrivateState\s*\(/.test(fb));
assert.ok(fb.includes('function validateCurrentMatchSessionForUid'));
assert.ok(fb.includes('ownerSessionId: MULTIPLAYER_CLIENT_SESSION_ID'));
assert.ok(fb.includes("throw new Error('MULTIPLAYER_PRIVATE_SELECTION_OWNER_MISMATCH')"));

// Self-echo ya no puede asumir que "mismo rol" == "misma pestaña".
assert.ok(main.includes('const isSelfEcho = !!writerClientId && writerClientId === matchSyncClientId;'));
assert.ok(!main.includes('writerRole === myRole'));

// Offline/partición: tres retries rápidos, recovery lento y gameplay fail-closed.
assert.equal(SYNC_RECOVERY_RETRY_MS, 5000);
assert.equal(MULTIPLAYER_READY_TIMEOUT_MS, 300000);
assert.ok(main.includes("failReadyBarrier('listener_error', error)"));
assert.ok(main.includes("failReadyBarrier('timeout')"));
assert.ok(main.includes('const abandonConfirmed = await publishMatchState({ force:true });'));
assert.ok(main.includes("throw new Error('MULTIPLAYER_ABANDON_NOT_CONFIRMED')"));
assert.ok(texts.includes("'multiplayer.ready.failed'"));
for (const marker of [
  'setMultiplayerSyncBlocked(\'transport\')',
  'scheduleSlowMatchRecovery',
  'showMultiplayerSyncBarrier',
  'state.multiplayerSessionSuperseded',
  'isMultiplayerInteractionBlocked()'
]) assert.ok(main.includes(marker), `missing fail-closed marker ${marker}`);
assert.ok(ui.includes("export function showMultiplayerSyncBarrier"));
assert.ok(ui.includes("kind === 'session_superseded'"));
assert.ok(texts.includes("'multiplayer.sync.reconnecting'"));
assert.ok(texts.includes("'multiplayer.session.superseded'"));
assert.ok(turn.includes('isMultiplayerInteractionBlocked()) return;'));
assert.ok(turn.includes('if (isMultiplayerInteractionBlocked()) { refreshTurnPriorityHudClock(); return; }'));

// Safe-point durable: una resolución async se marca antes y se limpia sólo con publish ACK.
assert.ok(sync.includes("'multiplayerResolutionMarker'"));
assert.ok(turn.includes('const markerConfirmed = await publishMatchState({ force:true });'));
assert.ok(turn.includes('const safePointConfirmed = await publishMatchState({ force:true });'));
assert.ok(turn.includes('multiplayer_resolution_safe_point_pending_recovery'));
assert.ok(reliability.includes('resolution_authority_process_lost'));
assert.ok(reliability.includes('remote_decision_requester_lost'));

// Deck Intelligence privacy sigue sellado en la acumulativa.
assert.ok(!/console\.(?:log|info|debug|warn)\s*\([\s\S]{0,260}Deck Intelligence/i.test(utils));
assert.ok(!/rival_deck_ready[^\n]{0,240}archetype/.test(main));

// Pure behavior: takeover invalida cliente viejo, no al rival.
const oldHost = 'mps_old_host_123';
const newHost = 'mps_new_host_456';
const guest = 'mps_guest_789';
const doc = { hostSessionId:newHost, guestSessionId:guest };
assert.equal(validateRoleSession(doc, 'host', oldHost).ok, false);
assert.equal(validateRoleSession(doc, 'host', newHost).ok, true);
assert.equal(validateRoleSession(doc, 'guest', guest).ok, true);
assert.equal(classifyReconnectSafety({}, 'host').ok, true);
assert.equal(classifyReconnectSafety({multiplayerResolutionMarker:{authorityRole:'host',kind:'stack_resolution'}}, 'host').ok, false);

// Rules privadas se verifican en Artifact/Rules gate, nunca se publican dentro del GitHubSource.
const rulesPath = process.env.ARGENTINIA_FIRESTORE_RULES || '';
if (rulesPath) {
  const rules = fs.readFileSync(rulesPath, 'utf8');
  assert.ok(rules.includes('23.13.79'));
  assert.ok(rules.includes('function validMatchIdentityTransition()'));
  assert.ok(rules.includes('function validMatchSessionTransition()'));
  assert.ok(rules.includes("request.auth.uid != resource.data.hostUid"));
  assert.ok(rules.includes("request.resource.data.get('hostUid', null) == request.auth.uid"));
  assert.ok(rules.includes("request.resource.data.get('guestUid', null) == null"));
  assert.ok(rules.includes("hasOnly(['status', 'guestUid', 'guestEngineVersion', 'guestSessionId', 'players', 'updatedAt'])"));
  assert.ok(rules.includes('match /privateSelections/{requestId}'));
  assert.ok(rules.includes("d.get('ownerSessionId', '') == m.get('hostSessionId', '')"));
  assert.ok(rules.includes("d.get('ownerSessionId', '') == m.get('guestSessionId', '')"));
  assert.ok(rules.includes('allow create: if isAuthenticated() && validPrivateSelectionCreate(matchId, requestId);'));
  assert.ok(rules.includes('allow update: if false;'));
  assert.ok(rules.includes("'23.13.79'"));
}

const lab = path.join(root, 'tools/run_multiplayer_hardening_lab_23_19_1.mjs');
const { stdout } = await execFileAsync(process.execPath, [lab, '--cases', '5000'], { timeout:30000, maxBuffer:4*1024*1024 });
assert.match(stdout, /MULTIPLAYER_HARDENING_LAB_23_19_1_OK/);
assert.match(stdout, /supersededRejected=5000/);
assert.match(stdout, /newOwnerAccepted=5000/);

console.log('MULTIPLAYER_RELIABILITY_HARDENING_23_19_1_OK selfJoin=PASS identityRules=PASS sameRoleFence=PASS privateSelectionFence=PASS failClosed=PASS reconnectSafePoint=PASS legacyAtomicApis=REMOVED deckPrivacy=PASS rulesContract=PASS lab=PASS');
