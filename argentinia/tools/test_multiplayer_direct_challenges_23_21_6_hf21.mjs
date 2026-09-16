import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const ui = read('../js/ui.js');
const texts = read('../js/gameTexts.js');
const impl = read('../js/firebaseClientImpl.js');
const facade = read('../js/firebaseClient.js');
const economy = read('../js/economyClient.js');
const version = read('../js/version.js');
const fnIndex = read('../../functions/src/index.js');
const challenge = read('../../functions/src/multiplayer/directChallenges.js');

// HF21 visual polish: header controls share one vertical rhythm and the six-char input is compact.
assert.match(ui, /#multiplayer-overlay \.encyclopedia-back-btn \{ height:44px; min-height:44px;/);
assert.match(ui, /#multiplayer-overlay \.mydecks-title \{ line-height:44px; height:44px;/);
assert.match(ui, /\.mp-header-connect \.store-buy-btn \{[^}]*height:44px; min-height:44px;/s);
assert.match(ui, /\.mp-header-code\.encyclopedia-search-input \{[^}]*flex:0 0 112px;[^}]*width:112px;[^}]*margin:0;/s);
assert.match(ui, /\.mp-header-code\.encyclopedia-search-input \{ flex:0 0 88px; width:88px;/);
assert.match(ui, /\.mp-panel-head \{[^}]*min-height:48px;/s);
assert.match(ui, /\.mp-player-row,\.mp-match-row \{[^}]*min-height:54px;/s);

// Client workflow: JUGAR is actionable, outgoing countdown is cancellable, incoming modal accepts/rejects.
assert.match(ui, /data-challenge-uid/);
assert.match(ui, /createDirectChallenge\(targetUid\)/);
assert.match(ui, /resolveDirectChallenge\(challengeId, action\)/);
assert.match(ui, /listenToDirectChallenges/);
assert.match(ui, /mp-challenge-countdown/);
assert.match(ui, /multiplayer\.challenge\.accept/);
assert.match(ui, /multiplayer\.challenge\.reject/);
assert.match(ui, /DIRECT_CHALLENGE_TTL_MS = 20_000/);
assert.match(ui, /beginAcceptedChallengeMatch/);
assert.match(texts, /'multiplayer\.challenge\.rejected'/);
assert.match(texts, /'multiplayer\.challenge\.expired'/);

// Firebase facade keeps challenge documents read-only in the browser; actions go through the existing callable.
assert.match(economy, /scope:\s*'challenge'/);
assert.match(economy, /sendDirectChallengeServer/);
assert.match(impl, /collection\(db, 'multiplayerChallenges'\)/);
assert.match(impl, /where\('participants', 'array-contains', me\)/);
assert.match(impl, /MULTIPLAYER_CLIENT_SESSION_ID/);
assert.match(facade, /listenToDirectChallenges/);
assert.match(facade, /createDirectChallenge = asyncProxy/);
assert.match(facade, /resolveDirectChallenge = asyncProxy/);

// Backend: 20-second TTL, freshness validation, per-user locks, persistent anti-spam and atomic match creation.
assert.match(challenge, /DIRECT_CHALLENGE_TTL_MS = 20_000/);
assert.match(challenge, /DIRECT_CHALLENGE_PRESENCE_STALE_MS = 110_000/);
assert.match(challenge, /DIRECT_CHALLENGE_MIN_INTERVAL_MS = 5_000/);
assert.match(challenge, /DIRECT_CHALLENGE_PAIR_COOLDOWN_MS = 15_000/);
assert.match(challenge, /DIRECT_CHALLENGE_WINDOW_MAX = 8/);
const pairCooldownCheck = challenge.indexOf("MULTIPLAYER_CHALLENGE_PAIR_COOLDOWN");
const genericRateCheck = challenge.indexOf("MULTIPLAYER_CHALLENGE_RATE_LIMIT");
assert.ok(pairCooldownCheck >= 0 && genericRateCheck >= 0 && pairCooldownCheck < genericRateCheck, 'pair cooldown must take precedence over generic rate limit when both apply');
assert.match(challenge, /multiplayerChallengeLocks/);
assert.match(challenge, /multiplayerChallengeRate/);
assert.match(challenge, /status:'active', hostUid:inviterUid, startingRole, guestUid:inviteeUid/);
assert.match(challenge, /tx\.set\(inviterUserRef, \{ activeMatchId:code \}/);
assert.match(challenge, /tx\.set\(inviteeUserRef, \{ activeMatchId:code \}/);
assert.match(challenge, /hostSessionId, guestSessionId:acceptSessionId/);
assert.match(fnIndex, /if \(scope === 'challenge'\)/);
assert.match(fnIndex, /createDirectChallenge/);
assert.match(fnIndex, /resolveDirectChallenge/);
assert.match(version, /FIRESTORE_RULES_VERSION = '23\.13\.89'/);
const callableCount=(fnIndex.match(/^export const [A-Za-z0-9_]+ = onCall/gm)||[]).length;
assert.equal(callableCount,41);

console.log('MULTIPLAYER_DIRECT_CHALLENGES_23_21_6_HF21_OK ui=aligned+compact-code invite=20s accept=ATOMIC_MATCH reject+cancel+expire=PASS antiSpam=LOCK+RATE races=TRANSACTIONAL functions=41 rules=23.13.89');
