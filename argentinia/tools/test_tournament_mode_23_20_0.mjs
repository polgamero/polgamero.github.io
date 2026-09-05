import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const repo=path.resolve(root,'..');
const fn=path.join(repo,'functions');
const read=p=>fs.readFileSync(p,'utf8');
const ui=read(path.join(root,'js/ui.js'));
const main=read(path.join(root,'js/main.js'));
const texts=read(path.join(root,'js/gameTexts.js'));
const econ=read(path.join(root,'js/economyClient.js'));
const facade=read(path.join(root,'js/firebaseClient.js'));
const impl=read(path.join(root,'js/firebaseClientImpl.js'));
const config=read(path.join(root,'js/tournamentConfig.js'));
const version=read(path.join(root,'js/version.js'));
const index=read(path.join(fn,'src/index.js'));
const core=read(path.join(fn,'src/economy/tournamentCore.js'));
const tournament=read(path.join(fn,'src/economy/tournament.js'));
const roster=read(path.join(fn,'src/trusted/tournamentRoster.js'));
const constants=read(path.join(fn,'src/shared/constants.js'));
const workflow=read(path.join(repo,'.github/workflows/pages.yml'));

assert.match(version,/ENGINE_VERSION = '23\.20\.0'/);
assert.match(version,/FIRESTORE_RULES_VERSION = '23\.13\.80'/);
assert.match(version,/ECONOMY_PROTOCOL_VERSION = 'econ-23\.19\.5\.6'/);
assert.match(version,/ECONOMY_SCHEMA_VERSION = 8/);
assert.match(constants,/ENGINE_VERSION = '23\.20\.0'/);
assert.match(constants,/ECONOMY_SCHEMA_VERSION = 8/);
assert.match(constants,/minInstances: 0/); assert.match(constants,/maxInstances: 1/); assert.match(constants,/concurrency: 10/); assert.match(constants,/enforceAppCheck: false/);

assert.match(texts,/'menu\.play': definition\('Menú', 'PARTIDA SIMPLE'/);
assert.match(texts,/'menu\.tournament': definition\('Menú', 'TORNEO'/);
for(const key of ['tournament.title','tournament.rules.body','tournament.rules.lead','tournament.rules.format1','tournament.rules.resume1','tournament.rules.rewards1','tournament.abandon','tournament.abandon.confirm','tournament.round.round16','tournament.round.quarter','tournament.round.semi','tournament.round.final','tournament.match.warning','tournament.match.returnFixture']) assert.ok(texts.includes(`'${key}'`),key);
assert.match(ui,/id="menu-tournament"/);
assert.match(ui,/export function showTournamentScreen/);
assert.match(ui,/tournament-fixture/);
assert.match(ui,/tournament-rules-grid/);
assert.match(ui,/id=\"tournament-abandon\"/);
assert.match(ui,/state\.currentUser\?\.photoURL/);
assert.match(ui,/damage\.modal\.intro', \{ attacker: attacker\.name, power: totalDamage \}/);
assert.match(ui,/getTournamentState\(\{resolveInterrupted:true\}\)/);
assert.match(main,/async function startTournamentFlow/);
assert.match(main,/currentTournamentMatch: null/);
assert.match(main,/beginTournamentMatch\(tournament\.tournamentId\)/);
assert.match(main,/buildRandomDeck\(botIdentity, \{ quality: botQuality, archetypeId:/);
assert.match(main,/\{ tournament: !!state\.currentTournamentMatch \}/);
assert.match(main,/argentinia\.tournament\.openAfterReload\.v1/);

for(const field of ['tournamentRewardedStartsPerDay','tournamentNpcRandomnessPercent','tournamentRound16Points','tournamentQuarterPoints','tournamentSemiPoints','tournamentFinalPoints','tournamentRound16Difficulty','tournamentFinalDeckQuality']) assert.ok(config.includes(field),field);
assert.match(config,/config = config && typeof config === 'object'/);
assert.match(ui,/TORNEO · PREMIOS Y LÍMITES/);
assert.match(ui,/TORNEO · DIFICULTAD Y MAZOS/);
assert.match(ui,/applyTournamentConfig\(newConfig\)/);

for(const callable of ['economyGetTournament','economyStartTournament','economyBeginTournamentMatch','economySettleTournamentMatch','economyForfeitTournament']) {
  assert.ok(index.includes(`export const ${callable}`),callable);
  assert.ok(econ.includes(`'${callable}'`),callable+' transport');
}
for(const proxy of ['getTournamentState','startTournament','beginTournamentMatch','settleTournamentMatch','forfeitTournament','abandonTournament']) assert.ok(facade.includes(`'${proxy}'`)||impl.includes(`function ${proxy}`),proxy);
assert.match(index,/tournamentAuthority: 'server'/);
assert.match(core,/rewardedStartsPerDay:1/);
assert.match(core,/round16:Object\.freeze\(\{ points:100,packs:0,difficulty:'medium',deckQuality:'good' \}\)/);
assert.match(core,/final:Object\.freeze\(\{ points:500,packs:2,difficulty:'hard',deckQuality:'elite' \}\)/);
assert.match(tournament,/tournamentReceipts/);
assert.match(tournament,/economyEvents/);
assert.match(tournament,/playerStatsMirrorServer/);
assert.match(tournament,/export async function abandonTournamentTx/);
assert.match(tournament,/tournament_abandon_server/);
assert.match(index,/betweenMatches\?'tournament\.abandon_run':'tournament\.forfeit_match'/);
assert.match(tournament,/Keep tournamentActive pointing at the most recent run/);
const npcIds=[...roster.matchAll(/\['(npc_\d{3})'/g)].map(m=>m[1]);
assert.equal(npcIds.length,40); assert.equal(new Set(npcIds).size,40);
assert.match(roster,/\.\/assets\/images\/npcs\/\$\{id\}\.png/);

// Runtime polish regressions found in the first production smoke.
assert.match(texts,/setGameTextRuntimeVariablesProvider/);
assert.match(main,/setGameTextRuntimeVariablesProvider\(\(\) => \(\{ rival: getRivalName\(\) \}\)\)/);
assert.doesNotMatch(main,/console\.error\('Falló[^']*Tano/,'runtime bot console diagnostics must use the assigned rival name');
for (const key of ['game.draw.rival','game.mulligan.bot','game.points.botWin','ability.additionalDiscard.botPaid','bot.land.played','bot.priority.noResponse','bot.attack.count']) {
  const line=texts.split('\n').find(v=>v.includes(`'${key}'`));
  assert.ok(line?.includes('{rival}'),`${key} must use dynamic rival`);
}
assert.match(impl,/const usernames = \{\};/);
assert.match(impl,/where\(documentId\(\), 'in', chunk\)/);
assert.match(ui,/economyAuditIdentityHtml/);
assert.match(ui,/admin\.audit\.uidTooltip/);

// CI keeps the canonical 113-test sweep, but no longer reruns 51 test_*.mjs files a second time.
const individualWorkflowTests=[...workflow.matchAll(/node (tools\/test_[^\s]+\.mjs)/g)].map(m=>m[1]);
assert.equal(individualWorkflowTests.length,0);
assert.match(workflow,/Run dynamic reliability labs once/);
assert.match(workflow,/run_headless_full_game_lab_23_18_2\.mjs/);
assert.match(workflow,/run_multiplayer_hardening_lab_23_19_1\.mjs/);

console.log('TOURNAMENT_MODE_23_20_0_OK format=16_KNOCKOUT npcRoster=40 resume=BETWEEN_MATCHES inMatchExit=ELIMINATION rewards=SERVER_EXACTLY_ONCE admin=ALL_BALANCE_VALUES gameTexts=ADMIN_EDITABLE ai=ROUND_SCALING final=HARD+ELITE rules=23.13.80_UNCHANGED costSafety=0/1/10 appCheck=OBSERVE_ONLY callables=30');
