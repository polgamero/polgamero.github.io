import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const ui = read('../js/ui.js');
const texts = read('../js/gameTexts.js');
const firebaseImpl = read('../js/firebaseClientImpl.js');
const firebaseFacade = read('../js/firebaseClient.js');
const economy = read('../js/economyClient.js');
const version = read('../js/version.js');
const fnIndex = read('../../functions/src/index.js');
const communication = read('../../functions/src/multiplayer/communication.js');
const lobbyPolicy = read('../../functions/src/multiplayer/lobbyChatPolicy.js');

// Header/layout: reuse the same shell as Mis mazos, no technical protocol subtitle,
// manual create/join lives in the fixed header and the body is a 3-column social lobby.
assert.match(ui, /injectMyDecksStyles\(\)/);
assert.match(ui, /class="mydecks-header mp-header"/);
assert.match(ui, /class="encyclopedia-back-btn"/);
assert.match(ui, /id="mp-header-connect"/);
assert.match(ui, /id="mp-create"/);
assert.match(ui, /id="mp-code-input"/);
assert.match(ui, /id="mp-join"/);
assert.match(ui, /grid-template-columns:\s*minmax\(280px,1\.04fr\)\s+minmax\(250px,\.90fr\)\s+minmax\(320px,1\.10fr\)/);
assert.doesNotMatch(ui.slice(ui.indexOf('export function showMultiplayerLobby'), ui.indexOf('export function showMultiplayerLobby') + 2200), /multiplayer\.lobby\.subtitle/);
assert.match(texts, /'multiplayer\.join\.placeholder':\s*definition\('Multiplayer', 'Código \(6\)'/);

// Players: own uid never appears; search reuses Encyclopedia field; hover includes ELO/W-L.
assert.match(ui, /filter\(uid => uid !== me\)/);
assert.match(ui, /id="mp-player-search"/);
assert.match(ui, /class="encyclopedia-search-input"[^>]*id="mp-player-search"/);
assert.match(ui, /ELO \$\{elo\}.*\$\{wins\}V \/ \$\{losses\}D/);

// Active-match hygiene: require both identities, reject self-match/terminal/stale records.
assert.match(ui, /String\(match\.hostUid\) === String\(match\.guestUid\)/);
assert.match(ui, /match\.gameOver === true \|\| match\.endedAt \|\| match\.abandonedBy/);
assert.match(ui, /ACTIVE_MATCH_STALE_MS\s*=\s*20 \* 60_000/);

// Global lobby chat: no emotes, same player tooltip, 220-char composer, server-backed listener/send.
assert.match(ui, /id="mp-lobby-chat-list"/);
assert.match(ui, /id="mp-lobby-chat-input"[^>]*maxlength="220"/);
assert.match(ui, /id="mp-lobby-chat-send"/);
assert.match(ui, /listenToLobbyCommunication/);
assert.match(ui, /sendLobbyCommunication/);
assert.match(ui, /class="mp-chat-name"[^>]*title="\$\{escapeHtml\(playerHoverText\(stats\)\)\}"/);
const lobbyFn = ui.slice(ui.indexOf('export function showMultiplayerLobby'));
assert.doesNotMatch(lobbyFn, /mp-emote|sendMultiplayerEmote|emote-picker/i);
assert.match(firebaseImpl, /doc\(db, 'lobbyCommunications', 'global'\)/);
assert.match(firebaseFacade, /listenToLobbyCommunication/);
assert.match(economy, /scope:\s*'lobby'/);

// Backend authority: same callable, dedicated storage, bounded event history and server anti-spam/filter.
assert.match(fnIndex, /if \(scope === 'lobby'\)/);
assert.match(fnIndex, /sendLobbyCommunication\(\{ db, uid:auth\.uid, text:data\.text \}\)/);
assert.match(lobbyPolicy, /LOBBY_CHAT_EVENT_CAP = 60/);
assert.match(lobbyPolicy, /LOBBY_CHAT_MIN_INTERVAL_MS = 2500/);
assert.match(lobbyPolicy, /LOBBY_CHAT_BURST_MAX = 5/);
assert.match(lobbyPolicy, /LOBBY_CHAT_LONG_MAX = 20/);
assert.match(lobbyPolicy, /LOBBY_CHAT_DUPLICATE_WINDOW_MS = 45_000/);
assert.match(lobbyPolicy, /lobbyChatContainsBlockedLanguage/);
assert.match(communication, /collection\('lobbyCommunications'\)\.doc\('global'\)/);
assert.match(communication, /evaluateLobbyChatRate/);
assert.match(communication, /collection\('lobbyChatRate'\)\.doc\(uid\)/);
assert.match(version, /FIRESTORE_RULES_VERSION = '23\.13\.89'/);

// No new callable: the global chat deliberately reuses multiplayerSendCommunication.
const callableCount = (fnIndex.match(/^export const [A-Za-z0-9_]+ = onCall/gm) || []).length;
assert.equal(callableCount, 42);

console.log('MULTIPLAYER_LOBBY_UX_CHAT_23_21_6_HF20_OK columns=3 header=manual-fixed players=self-hidden+search matches=hygiene chat=server-authoritative+filtered+rate-limited functions=42 rules=23.13.89');
