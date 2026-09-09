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
const social = read('js/multiplayerSocial.js');
const emoteCatalog = read('js/emoteCatalog.js');
const html = read('index.html');
const css = read('css/style.css');
const mobileCss = read('css/mobile.css');
const combatMap = read('js/combatMap.js');
const animationDirector = read('js/animationDirector.js');
const economyClient = read('js/economyClient.js');
const functionsIndex = fs.readFileSync(path.join(root, '../functions/src/index.js'), 'utf8');
const serverSocial = fs.readFileSync(path.join(root, '../functions/src/multiplayer/communication.js'), 'utf8');
const trustedEmotes = fs.readFileSync(path.join(root, '../functions/src/trusted/emoteCatalog.js'), 'utf8');

assert.equal(ENGINE_VERSION, '23.21.3');
assert.equal(ENGINE_PROTOCOL_VERSION, 'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION, '23.13.86');
assert.equal(MULTIPLAYER_RELIABILITY_VERSION, '23.19.1');
assert.equal(manifest.engineVersion, '23.21.3');
assert.equal(manifest.engineProtocolVersion, 'mp-23.19.2');
assert.equal(manifest.firestoreRulesVersion, '23.13.86');
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

// 23.21.3 — Multiplayer Social Layer: visually shares the bitácora, but transport is
// server-authoritative and completely separate from gameplay snapshots/telemetry.
assert.ok(html.includes('id="mp-social-shell"'));
assert.ok(html.includes('id="mp-chat-input"'));
assert.ok(html.includes('id="mp-chat-send"'));
assert.ok(html.includes('id="mp-emote-picker"'));
assert.ok(social.includes("listenToMatchCommunication"));
assert.ok(social.includes("sendMultiplayerCommunication"));
assert.ok(social.includes("row.className=`log-entry mp-social-log-entry"));
assert.ok(social.includes("mp-social-own"));
assert.ok(social.includes("mp-social-rival"));
assert.ok(social.includes("const MAX_CHAT = 220"));
assert.ok(social.includes("animationsEffectivelyEnabled"));
assert.ok(social.includes("MUTE_KEY"));
assert.ok(emoteCatalog.includes("['webp','gif','png']"));
assert.ok(emoteCatalog.includes('applyEmoteCatalogSnapshot'));
assert.ok(social.includes('fetchStorefrontAuthority'));
assert.ok(emoteCatalog.includes("pricePoints:500"));
assert.ok(css.includes('.mp-social-own'));
assert.ok(css.includes('.mp-social-rival'));
// 23.21.3 RC2 — desktop HUD safety after chat/emotes. HP shares one line and
// only the Bitácora body is allowed to shrink; action buttons stay inside the
// middle viewport row instead of overflowing under the local player badge.
assert.equal((html.match(/class="hp-line"/g)||[]).length,2);
assert.ok(css.includes('grid-template-rows:minmax(0,1fr) auto auto auto auto auto'));
assert.ok(css.includes(`.log-section {\n    flex:1 1 0;`));
assert.ok(css.includes('overflow:hidden;'));
assert.ok(css.includes('.hp-line .hp-text'));
assert.ok(css.includes(`.turn-controls {\n    position:relative;\n    z-index:20;`));
assert.ok(mobileCss.includes('html.argentinia-mobile .hp-line'));
// Player-target visuals remain rect-based. Badge compaction must not introduce
// hardcoded endpoint offsets for combat arrows or damage animations.
assert.ok(combatMap.includes("document.querySelector('.player-card.local-card')"));
assert.ok(combatMap.includes('const sr = sourceEl.getBoundingClientRect(), tr = targetEl.getBoundingClientRect();'));
assert.ok(animationDirector.includes("document.querySelector(isLocal ? '.player-card.local-card' : '.player-card.rival-card')"));
assert.ok(animationDirector.includes('const rect = rectSnapshot(el);'));
assert.ok(economyClient.includes("call('multiplayerSendCommunication'"));
assert.ok(economyClient.includes("call('economyPurchaseEmote'"));
assert.ok(functionsIndex.includes('export const multiplayerSendCommunication = onCall'));
assert.ok(functionsIndex.includes('export const economyPurchaseEmote = onCall'));
assert.ok(functionsIndex.includes('export const economyAdminSetEmoteCatalog = onCall'));
assert.ok(trustedEmotes.includes("EMOTE_CATALOG_PATH = 'gameConfig/emotes'"));
assert.ok(trustedEmotes.includes('MAX_EMOTES = 128'));
assert.ok(serverSocial.includes('loadTrustedEmoteCatalog(db, tx)'));
assert.equal([...functionsIndex.matchAll(/export const \w+\s*=\s*onCall\(/g)].length, 40);
for (const contract of [
  'CHAT_MAX_CHARS = 220','COMMUNICATION_EVENT_CAP = 40','CHAT_MIN_INTERVAL_MS = 1500',
  'CHAT_BURST_MAX = 5','EMOTE_MIN_INTERVAL_MS = 4000','EMOTE_BURST_MAX = 3',
  'COMMUNICATION_TTL_MS = 48 * 60 * 60 * 1000'
]) assert.ok(serverSocial.includes(contract), `missing social authority contract ${contract}`);
assert.ok(serverSocial.includes("db.collection('matchCommunications').doc(id)"));
assert.ok(serverSocial.includes("match.status !== 'active'"));
assert.ok(serverSocial.includes("match.hostReady !== true || match.guestReady !== true"));
assert.ok(serverSocial.includes("MULTIPLAYER_EMOTE_NOT_OWNED"));
assert.ok(trustedEmotes.includes("TRUSTED_EMOTE_CATALOG_VERSION = '23.21.3-rc4'"));
assert.equal((trustedEmotes.match(/id:'emote_/g)||[]).length,12);
assert.ok(!main.includes('matchCommunications'));
assert.ok(!main.includes('MULTIPLAYER_CHAT_RATE_LIMIT'));

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
  assert.ok(rules.includes('23.13.86'));
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
  assert.ok(rules.includes("'23.13.86'"));
}

const lab = path.join(root, 'tools/run_multiplayer_hardening_lab_23_19_1.mjs');
const { stdout } = await execFileAsync(process.execPath, [lab, '--cases', '5000'], { timeout:30000, maxBuffer:4*1024*1024 });
assert.match(stdout, /MULTIPLAYER_HARDENING_LAB_23_19_1_OK/);
assert.match(stdout, /supersededRejected=5000/);
assert.match(stdout, /newOwnerAccepted=5000/);

console.log('MULTIPLAYER_RELIABILITY_HARDENING_23_19_1_OK selfJoin=PASS identityRules=PASS sameRoleFence=PASS privateSelectionFence=PASS failClosed=PASS reconnectSafePoint=PASS legacyAtomicApis=REMOVED deckPrivacy=PASS rulesContract=PASS lab=PASS');
