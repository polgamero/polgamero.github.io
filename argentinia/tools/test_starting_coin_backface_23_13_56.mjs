import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../js/startingCoin.js', import.meta.url), 'utf8');

assert.match(src, /starting-coin-front span'\)\.textContent = local/);
assert.match(src, /starting-coin-back span'\)\.textContent = rival/);
assert.match(src, /winnerSide === 'rival' \? backFace : frontFace/);
assert.match(src, /winnerFace\?\.classList\.add\('is-winner'\)/);
assert.match(src, /coin\.classList\.add\('is-landed'\)/);
assert.match(src, /-webkit-backface-visibility:hidden/);
assert.match(src, /\.starting-coin\.is-landed \.starting-coin-face:not\(\.is-winner\)\{opacity:0\}/);
assert.match(src, /\.starting-coin\.is-landed \.starting-coin-face\.is-winner\{opacity:1\}/);

console.log('STARTING_COIN_BACKFACE_23_13_56_OK');
