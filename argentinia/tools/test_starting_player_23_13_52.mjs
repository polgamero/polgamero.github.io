import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chooseSoloStartingSide, chooseMultiplayerStartingRole, normalizeStartingRole, startingSideForRole } from '../js/startingPlayer.js';

for (let i = 0; i < 50; i++) {
  assert.ok(['local','rival'].includes(chooseSoloStartingSide()));
  assert.ok(['host','guest'].includes(chooseMultiplayerStartingRole()));
}
assert.equal(normalizeStartingRole('host'), 'host');
assert.equal(normalizeStartingRole('guest'), 'guest');
assert.equal(normalizeStartingRole('nope'), 'host');
assert.equal(startingSideForRole('host','host'), 'local');
assert.equal(startingSideForRole('host','guest'), 'rival');
assert.equal(startingSideForRole('guest','host'), 'rival');
assert.equal(startingSideForRole('guest','guest'), 'local');

const firebase = fs.readFileSync(new URL('../js/firebaseClientImpl.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
assert.match(firebase, /startingRole\s*,/);
assert.match(firebase, /chooseMultiplayerStartingRole\(\)/);
assert.match(main, /chooseSoloStartingSide\(\)/);
assert.match(main, /startingSideForRole\(startingRole, myRole\)/);
assert.match(main, /showStartingCoinToss\(/);
assert.match(main, /state\.activePlayer = soloStartingSide/);
assert.match(main, /takeBotPriorityAction\(\)/);
assert.match(ui, /match\.startingRole\s*\|\|\s*'host'/);
console.log('STARTING_PLAYER_23_13_52_OK');
