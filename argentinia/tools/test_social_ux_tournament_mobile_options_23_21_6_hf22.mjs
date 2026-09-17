import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const ui = read('../js/ui.js');
const main = read('../js/main.js');
const mobile = read('../css/mobile.css');
const texts = read('../js/gameTexts.js');
const presence = read('../js/multiplayerPresence.js');
const tournamentConfig = read('../js/tournamentConfig.js');
const store = read('../js/store.js');
const fnIndex = read('../../functions/src/index.js');
const communication = read('../../functions/src/multiplayer/communication.js');
const lobbyPolicy = read('../../functions/src/multiplayer/lobbyChatPolicy.js');
const challenges = read('../../functions/src/multiplayer/directChallenges.js');
const tournamentCore = read('../../functions/src/economy/tournamentCore.js');
const tournament = read('../../functions/src/economy/tournament.js');
const version = read('../js/version.js');

// Lobby chat is ephemeral by both age and count, with server pruning + immediate client filtering.
assert.match(lobbyPolicy, /LOBBY_CHAT_EVENT_CAP = 60/);
assert.match(lobbyPolicy, /LOBBY_CHAT_RETENTION_MS = 2 \* 60 \* 60 \* 1000/);
assert.match(communication, /nowMs - LOBBY_CHAT_RETENTION_MS/);
assert.match(ui, /LOBBY_CHAT_RETENTION_MS = 2 \* 60 \* 60_000/);
assert.match(ui, /createdAtMs[^\n]*>= cutoff/);

// Long messages must occupy their own block and wrap even as a single 220-character token.
assert.match(ui, /\.mp-chat-meta \{[^}]*display:flex[^}]*margin-bottom:4px/s);
assert.match(ui, /\.mp-chat-text \{[^}]*display:block[^}]*max-width:100%[^}]*white-space:pre-wrap[^}]*overflow-wrap:anywhere[^}]*word-break:break-word/s);
assert.match(mobile, /#multiplayer-overlay \.mp-chat-text \{[^}]*overflow-wrap:anywhere[^}]*word-break:break-word/s);
assert.match(ui, /<div class="mp-chat-meta">[\s\S]*<div class="mp-chat-text">/);

// ADMIN moderation is a tiny UI affordance but server-authoritative and audited without copying removed text.
assert.match(ui, /data-delete-chat-seq/);
assert.match(ui, /isAdminUser\(state\.currentUser\)/);
assert.match(ui, /deleteLobbyCommunication\(seq\)/);
assert.match(fnIndex, /if \(action === 'delete'\)[\s\S]*isAdminAuth\(auth\)[\s\S]*deleteLobbyCommunication/s);
assert.match(communication, /export async function deleteLobbyCommunication/);
assert.match(communication, /lobbyModerationAudit/);
assert.doesNotMatch(communication.slice(communication.indexOf('export async function deleteLobbyCommunication'), communication.indexOf('export async function sendMultiplayerCommunication')), /removedText|text:String\(removed/);
assert.match(texts, /'multiplayer\.lobby\.chatDeleteTitle'/);

// Player identity stats use one interaction surface: hover/focus desktop, click/tap mobile, in list and chat.
assert.match(ui, /function bindPlayerStatsInteractions/);
assert.match(ui, /matchMedia\?\.\('\(hover:hover\) and \(pointer:fine\)'\)/);
assert.match(ui, /addEventListener\('pointerenter'/);
assert.match(ui, /addEventListener\('focus'/);
assert.match(ui, /addEventListener\('click'/);
assert.match(ui, /data-player-uid/);
assert.match(ui, /ELO \$\{elo\}.*\$\{wins\}V \/ \$\{losses\}D/);

// Direct challenge reception is global after auth; the Lobby consumes one app-level event bus, never a second Firestore listener.
assert.match(main, /startGlobalDirectChallengeBridge\(state\.currentUser\.uid\)/);
assert.match(main, /listenToDirectChallenges\(me,handleGlobalChallengeRows/);
assert.match(main, /globalChallengeExpiredForMe/);
assert.match(main, /resolveDirectChallenge\(expired\.challengeId\|\|expired\.id,'expire'\)/);
assert.match(main, /argentinia:direct-challenges-updated/);
assert.match(ui, /addEventListener\('argentinia:direct-challenges-updated'/);
assert.doesNotMatch(ui, /listenToDirectChallenges\(/);
assert.match(challenges, /\['menu','multiplayer_lobby'\]\.includes/);
assert.match(challenges, /data\.availability !== 'available'/);
// Global invitations are race-hardened around transactional/unsafe UI states.
assert.match(presence, /challengeInteractionBlocked/);
assert.match(presence, /\['menu','multiplayer_lobby'\]\.includes\(current\.activity\)/);
assert.match(presence, /export function setChallengeInteractionBlocked/);
assert.match(main, /GLOBAL_CHALLENGE_SAFE_SURFACES/);
for (const id of ['mydecks-overlay','deckbuilder-overlay','pack-opening-overlay','chest-overlay','store-overlay','trade-market-overlay','tournament-overlay','deck-select-overlay']) {
  assert.match(main, new RegExp(id));
}
assert.match(main, /syncGlobalChallengeSurfaceSafety\(\{cancelOutgoing:false\}\)/);
assert.match(main, /String\(pending\.inviterUid \|\| ''\) === me[\s\S]*resolveDirectChallenge\(pending\.challengeId \|\| pending\.id, 'cancel'\)/s);
assert.match(main, /if\(!syncGlobalChallengeSurfaceSafety\(\{cancelOutgoing:false\}\)\)/);
assert.match(challenges, /action !== 'accept'[\s\S]*status/s);
assert.match(challenges, /if \(!isFreshLobbyPresence\(inviterPresence\.data\(\), nowMs\)\)/);
assert.match(challenges, /if \(!isFreshLobbyPresence\(inviteePresence\.data\(\), nowMs\)\)/);
assert.match(challenges, /await assertNoLiveMatch\(tx, db, inviterUser, inviterUid\)/);
assert.match(challenges, /await assertNoLiveMatch\(tx, db, inviteeUser, inviteeUid\)/);

// DND preference persists locally and changes Presence availability instead of disabling auth/listeners.
assert.match(presence, /argentinia\.multiplayer\.challengeInvitesEnabled\.v1/);
assert.match(presence, /availability = 'dnd'/);
assert.match(presence, /export function setChallengeInvitesEnabled/);
assert.match(ui, /id="opt-challenge-invites"/);
assert.match(texts, /'options\.challengeInvites'/);

// Tournament consolation defaults are 15/30/60/100, configurable, rewarded only on a real non-forfeit loss.
for (const [key,value] of [['Round16',15],['Quarter',30],['Semi',60],['Final',100]]) {
  assert.match(tournamentConfig, new RegExp(`tournament${key}LossPoints: ${value}`));
  assert.match(store, new RegExp(`tournament${key}LossPoints: ${value}`));
  assert.match(ui, new RegExp(`id: 'tournament${key}LossPoints'`));
}
assert.match(tournamentCore, /round16:Object\.freeze\(\{ points:100,lossPoints:15/);
assert.match(tournamentCore, /quarter:Object\.freeze\(\{ points:150,lossPoints:30/);
assert.match(tournamentCore, /semi:Object\.freeze\(\{ points:250,lossPoints:60/);
assert.match(tournamentCore, /final:Object\.freeze\(\{ points:500,lossPoints:100/);
assert.match(tournament, /if\(run\.rewardEligible && \(won \|\| !forfeit\)\)/);
assert.match(tournament, /won \? policy\.points : policy\.lossPoints/);
assert.match(tournament, /packsGain=won \? nonneg\(policy\.packs\) : 0/);

// Mobile Options: landscape is compact two-column; portrait deliberately becomes one column. Audio remains horizontal.
assert.match(mobile, /html\.argentinia-mobile \.options-layout-grid \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(mobile, /html\.argentinia-mobile \.options-audio-row \{[^}]*flex-direction:row/s);
assert.match(mobile, /max-height:calc\(100dvh - 12px\)/);
assert.match(mobile, /@media \(orientation:portrait\)[\s\S]*grid-template-columns:minmax\(0,1fr\)/s);

// Authority topology remains stable: no extra callable and no Rules migration required.
assert.match(version, /FIRESTORE_RULES_VERSION = '23\.13\.89'/);
const callableCount=(fnIndex.match(/^export const [A-Za-z0-9_]+ = onCall/gm)||[]).length;
assert.equal(callableCount,42);

console.log('SOCIAL_UX_TOURNAMENT_MOBILE_OPTIONS_23_21_6_HF22_OK chat=2H+60+ADMIN_DELETE+LONG_WRAP stats=HOVER+TAP challenges=GLOBAL+DND+RACE_FENCED tournamentLoss=15_30_60_100 mobileOptions=COMPACT functions=42 rules=23.13.89');
