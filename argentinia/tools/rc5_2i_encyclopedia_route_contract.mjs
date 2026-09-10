import fs from 'node:fs';
import assert from 'node:assert/strict';

const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const encStart = ui.indexOf('export function showEncyclopedia');
const deckStart = ui.indexOf('export function showDeckBuilderScreen');
assert.ok(encStart >= 0 && deckStart > encStart, 'Enciclopedia/deck builder boundaries missing');
const enc = ui.slice(encStart, deckStart);
assert.ok(enc.includes("browserSortOptionsHTML(activeTab, 'cmc')"), 'Enciclopedia must use the generic browser sort options');
assert.ok(!enc.includes('deckSortOptionsHTML'), 'Deck-only recent sort helper must not leak into Enciclopedia');

const handlerStart = ui.indexOf("overlay.querySelector('#menu-encyclopedia').addEventListener");
const nextHandler = ui.indexOf("overlay.querySelector('#menu-mydecks').addEventListener", handlerStart);
assert.ok(handlerStart >= 0 && nextHandler > handlerStart, 'Main-menu Enciclopedia handler missing');
const handler = ui.slice(handlerStart, nextHandler);
assert.ok(handler.includes('try {'), 'Enciclopedia route must guard synchronous initialization');
assert.ok(handler.includes("overlay.style.display = '';"), 'Enciclopedia route failure must restore the main menu');
assert.ok(handler.includes('releaseMenuIdentityAction();'), 'Enciclopedia route failure must release menu action lock');

console.log('RC5_2I_ENCYCLOPEDIA_ROUTE_CONTRACT_OK');
