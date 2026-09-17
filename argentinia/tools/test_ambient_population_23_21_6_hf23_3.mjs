import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Resolve against this test file, not process.cwd(). Gate05/Gate07 invoke this
// script while their working directory is the gate folder. Using cwd made the
// test incorrectly look for <gate>/js/ui.js on Windows/MSYS.
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const ui=read('js/ui.js');
const firebaseImpl=read('js/firebaseClientImpl.js');
const functionsIndex=read('../functions/src/index.js');
const directChallenges=read('../functions/src/multiplayer/directChallenges.js');
const bots=read('../functions/src/community/bots.js');
const manifest=JSON.parse(read('build-manifest.json'));

assert.equal([...functionsIndex.matchAll(/export const \w+\s*=\s*onCall\(/g)].length,42,'HF23.3 must reuse economyCommunityAction; no new callable instance');
assert.equal(manifest.functionsCount,42);
assert.match(functionsIndex,/action === 'directory_refresh'/);
assert.match(functionsIndex,/action === 'admin_set_bots'/);
assert.match(functionsIndex,/await advanceCommunityBots\(db/);
assert.match(firebaseImpl,/refreshLobbyDirectoryAuthority/);
assert.match(ui,/refreshLobbyDirectoryAuthority\(\)/);

// Internal identity exists, but public presence and playerStats intentionally receive no bot marker.
assert.match(bots,/isSystemBot:true, systemRole:'ambient_player'/);
assert.doesNotMatch(bots,/playerStatsMirrorServer\([^\n]*\{[^\n]*isBot/);
assert.doesNotMatch(bots,/batch\.set\(ref,\{[^}]*isBot/s);
assert.match(ui,/POBLACIÓN AMBIENTAL · 5 jugadores del sistema/);
assert.doesNotMatch(ui,/class="[^"]*bot-badge/i,'player-facing UI must not render a BOT badge');

// Presence is bounded to Argentina daytime/evening and randomized in stable slots.
assert.match(bots,/activeStartMinute:startMinute/);
assert.match(bots,/activeEndMinute:endMinute/);
assert.match(bots,/6\*60/);
assert.match(bots,/23\*60\+30/);
assert.match(bots,/visibleOnlineMax:clampInt\(raw\.visibleOnlineMax, 2, 0, 5\)/);
assert.match(bots,/deterministicPct\('presence',day,slot,uid\)/);
assert.match(bots,/slice\(0,cfg\.visibleOnlineMax\)/);
assert.match(bots,/nowMs-lastRefreshMs<60_000/,'bot presence heartbeat must stay fresher than 110s challenge threshold');

// Direct challenges remain normal pending docs, but system targets get a random shorter TTL;
// the generic expiry resolver returns rejected without ever creating a real match.
assert.match(directChallenges,/challengeTtlForTarget\(db, inviteeUid, nowMs\)/);
assert.match(directChallenges,/MULTIPLAYER_CHALLENGE_INVITER_UNAVAILABLE/,'ambient runtime fixture must establish fresh inviter playerPresence before invite');
assert.match(directChallenges,/expiredChallengeStatusForTarget/);
assert.match(directChallenges,/const status = action === 'reject' \? 'rejected' : \(action === 'cancel' \? 'cancelled' : expiredStatus\)/);
assert.match(bots,/challengeRejectMinSeconds/);
assert.match(bots,/challengeRejectMaxSeconds/);

// Market economy uses real inventory/reservations and never accepts a lower-rarity offer.
assert.match(bots,/getTradeMarketView\(db,uid\)/);
assert.match(bots,/createTradeListingTx/);
assert.match(bots,/acceptTradeOfferTx/);
assert.match(bots,/suppressPublicTradeStats:true/,'bot-mediated swaps must not increment public human trade stats');
assert.match(bots,/rejectTradeOfferTx/);
assert.match(bots,/if\(offeredRank<listedRank\)/);
assert.match(bots,/acceptHigherPct/);
assert.match(bots,/acceptEqualPct/);

// Simulated competitive movement is bot-vs-bot only and bounded.
assert.match(bots,/simulateBotGames/);
assert.match(bots,/Math\.max\(1050,Math\.min\(1350/);
assert.match(ui,/ambientUids=new Set/,'Admin statistics must exclude ambient system accounts from human KPIs');

console.log('AMBIENT_POPULATION_23_21_6_HF23_3_OK functions=42 identities=PRIVATE publicBadge=NONE presence=06:00-23:30+RANDOM challenges=AUTO_REJECT market=REAL_INVENTORY+RARITY_GUARD stats=HUMAN_ISOLATED');
