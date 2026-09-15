import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PLAYER_PRESENCE_HEARTBEAT_MS, PLAYER_PRESENCE_STALE_MS, isPresenceOnline, isPresenceAvailable, describePresenceActivity } from '../js/multiplayerPresence.js';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const presenceSource = read('../js/multiplayerPresence.js');
const ui = read('../js/ui.js');
const main = read('../js/main.js');
const gameTexts = read('../js/gameTexts.js');
const firebase = read('../js/firebaseClientImpl.js');
const version = read('../js/version.js');
const rules = fs.readFileSync(new URL('../../../02_Firestore_Rules_DEPLOY/FIRESTORE_RULES_COMPLETAS_ENTREGA_23_13_87_MULTIPLAYER_PRESENCE.rules', import.meta.url), 'utf8');

assert.equal(PLAYER_PRESENCE_HEARTBEAT_MS, 45_000);
assert.equal(PLAYER_PRESENCE_STALE_MS, 110_000);
assert.match(presenceSource,/Cost guard: una pestaña oculta publica AWAY una vez/);
const now = 1_000_000;
const online = { lastSeenAt:{ seconds:(now-20_000)/1000 }, availability:'available', activity:'menu' };
const stale = { lastSeenAt:{ seconds:(now-120_000)/1000 }, availability:'available', activity:'menu' };
assert.equal(isPresenceOnline(online,now),true);
assert.equal(isPresenceAvailable(online,now),true);
assert.equal(isPresenceOnline(stale,now),false);
assert.equal(describePresenceActivity({ ...online, activity:'solo', difficulty:'hard' },now),'Jugando Solo · Difícil');
assert.equal(describePresenceActivity({ ...online, availability:'busy', activity:'multiplayer' },now),'Jugando Multiplayer');
assert.equal(describePresenceActivity({ ...online, availability:'busy', activity:'tournament', tournamentRoundKey:'round16' },now),'Jugando Octavos de final · Torneo');

assert.match(ui,/multiplayer\.lobby\.players/);
assert.match(ui,/multiplayer\.lobby\.matches/);
assert.match(gameTexts,/Jugadores de Argentinia/);
assert.match(gameTexts,/Partidas Multiplayer en curso/);
assert.match(ui,/id=\\?"mp-copy-code\\?"/);
assert.match(ui,/navigator\.clipboard\.writeText\(code\)/);
assert.match(ui,/mp-challenge-btn/);
assert.match(ui,/multiplayer\.lobby\.challengeComing/);
assert.match(gameTexts,/Invitaciones directas: próxima etapa 23\.22\.1/);
assert.match(ui,/listenToPlayerPresence/);
assert.match(ui,/listenToActiveMultiplayerMatches/);
assert.match(ui,/fetchPublicPlayerStats/);
assert.match(ui,/setPlayerPresenceActivity\('multiplayer_lobby'/);

assert.match(firebase,/collection\(db, 'playerPresence'\)/);
assert.match(firebase,/where\('status', '==', 'active'\)/);
assert.match(firebase,/lastSeenAt: serverTimestamp\(\)/);
assert.match(firebase,/merge: false/);
assert.match(firebase,/deleteDoc\(doc\(db, 'playerPresence', uid\)\)/);
assert.match(main,/startPlayerPresence\(state\.currentUser\.uid\)/);
assert.match(main,/setPlayerPresenceActivity\(tournamentMatch \? 'tournament' : 'solo'/);
assert.match(main,/setPlayerPresenceActivity\('multiplayer'/);
assert.match(version,/FIRESTORE_RULES_VERSION = '23\.13\.87'/);

assert.match(rules,/match \/playerPresence\/\{userId\}/);
assert.match(rules,/allow read: if isAuthenticated\(\)/);
assert.match(rules,/allow create, update: if isUser\(userId\) && validPlayerPresence\(\)/);
assert.match(rules,/d\.lastSeenAt == request\.time/);
assert.doesNotMatch(rules,/match \/playerPresence\/\{userId\}[\s\S]{0,1200}'username'/);

console.log('MULTIPLAYER_LOBBY_PRESENCE_FOUNDATION_HF19_OK heartbeat=45s stale=110s livePlayers=YES activeMatches=YES manualCopy=YES challenges=DEFERRED');
