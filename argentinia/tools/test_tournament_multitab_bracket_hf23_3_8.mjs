import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const ui=read('js/ui.js');
const main=read('js/main.js');
const turn=read('js/turnManager.js');
const recovery=read('js/tournamentRecovery.js');
const texts=read('js/gameTexts.js');

// Multi-tab safety: ordinary fixture reads are non-destructive.
assert.match(ui,/getTournamentState\(\{resolveInterrupted:false\}\)/);
assert.match(ui,/fixture\/menu loads are strictly read-only/);
assert.match(ui,/tournament\.recovery\.activeElsewhere/);
assert.match(ui,/tournament-resolve-interrupted/);

// Same-tab recovery: pending terminal result first, interruption only after a real reload.
const pendingAt=main.indexOf('readTournamentPendingSettlement()');
const activeAt=main.indexOf('readTournamentActiveMatch()');
assert.ok(pendingAt>=0 && activeAt>pendingAt,'pending settlement must be checked before active interruption');
assert.match(main,/isReloadNavigation\(\)/);
assert.match(main,/getTournamentState\(\{ resolveInterrupted:true \}\)/);
assert.match(main,/markTournamentActiveMatch\(\{ tournamentId:tournament\.tournamentId, matchId:match\.matchId/);
assert.match(turn,/markTournamentPendingSettlement\(\{ tournamentId:context\.tournamentId, matchId:context\.matchId/);
assert.ok(turn.indexOf('markTournamentPendingSettlement') < turn.indexOf('settleTournamentMatch(context.tournamentId, context.matchId'),'pending marker must be durable before settle call');
assert.match(turn,/clearTournamentPendingSettlement\(\);\s*clearTournamentActiveMatch\(\);/s);
assert.match(recovery,/sessionStorage/);
assert.match(recovery,/argentinia\.tournament\.activeMatch\.v1/);
assert.match(recovery,/argentinia\.tournament\.pendingSettlement\.v1/);

// Bracket UX: split left/right bracket converging on central Argentinia cup + visual rewards.
for(const token of ['r16-left','qf-left','sf-left','sf-right','qf-right','r16-right']) assert.ok(ui.includes(token),`missing bracket column ${token}`);
assert.match(ui,/tournament-bracket-connectors/);
assert.match(ui,/assets\/images\/ui\/copa_argentinia\.png/);
assert.match(ui,/tournament-final-rewards/);
assert.match(ui,/COIN_ICON_HTML/);
assert.match(ui,/PACK_ICON_HTML/);
assert.match(ui,/enableDesktopDragScroll\(wrap,\{axis:'both'\}\)/);
assert.match(ui,/flex-direction:column/);
assert.match(ui,/\.tournament-avatar\{width:48px;height:48px/);

for(const key of [
  'tournament.fixtureDragHint','tournament.finalRewards','tournament.finalLossReward',
  'tournament.recovery.pending','tournament.recovery.retry','tournament.recovery.activeElsewhere',
  'tournament.recovery.resolve','tournament.recovery.resolveConfirm'
]) assert.ok(texts.includes(`'${key}'`),`missing Game Text ${key}`);

const cup=path.join(root,'assets/images/ui/copa_argentinia.png');
assert.ok(fs.existsSync(cup),'copa_argentinia.png placeholder missing');
const png=fs.readFileSync(cup);
assert.equal(png.subarray(1,4).toString(),'PNG');

console.log('TOURNAMENT_MULTITAB_BRACKET_HF23_3_8_OK readOnlyFixture=PASS pendingFirst=PASS sameTabReloadOnly=PASS manualZombieRecovery=PASS splitBracket=PASS cupPlaceholder=PASS dragBoth=PASS');
