import assert from 'node:assert/strict';
import fs from 'node:fs';

const coin = fs.readFileSync(new URL('../js/startingCoin.js', import.meta.url), 'utf8');
const audio = fs.readFileSync(new URL('../js/audioManager.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const version = fs.readFileSync(new URL('../js/version.js', import.meta.url), 'utf8');

assert.ok(version.includes("ENGINE_VERSION = '23.13.65'"), 'Engine debe ser 23.13.65.');

// Moneda: cilindro visible y dos caras independientes.
assert.match(coin, /COIN_THICKNESS_PX = 18/);
assert.match(coin, /COIN_EDGE_SEGMENTS = 56/);
assert.match(coin, /starting-coin-edge-segment/);
assert.match(coin, /starting-coin-front is-camera-visible/);
assert.match(coin, /starting-coin-back is-camera-hidden/);
assert.match(coin, /syncPhysicalFaceVisibility/);
assert.match(coin, /starting-coin-back\{transform:rotateX\(180deg\) translateZ/);
assert.doesNotMatch(coin, /winnerFace|is-winner/);

// SFX: exactos paths solicitados; una sola invocación por coin toss, antes de animar.
assert.match(audio, /\.\/assets\/sounds\/sfx\/moneda\.opus/);
assert.match(audio, /\.\/assets\/sounds\/sfx\/moneda\.mp3/);
assert.match(audio, /coinToss: Object\.freeze/);
const calls = [...coin.matchAll(/playSfx\('coinToss'\)/g)].length;
assert.equal(calls, 1, `coin toss debe disparar SFX una sola vez; halladas ${calls}`);
assert.ok(coin.lastIndexOf("playSfx('coinToss')") < coin.lastIndexOf('animateCoinFlight({ coin, flight'), 'SFX debe arrancar antes del primer frame de la animación.');

// Audio rápido: ya no está abajo de la columna principal; vive junto a Daily Rewards.
const rewardsStart = ui.indexOf('const rewardActionsHTML');
const rewardsEnd = ui.indexOf('container.innerHTML =', rewardsStart);
const rewardsSlice = ui.slice(rewardsStart, rewardsEnd);
assert.match(rewardsSlice, /id="menu-daily-rewards"/);
assert.match(rewardsSlice, /id="menu-music-toggle"/);
assert.ok(rewardsSlice.indexOf('menu-daily-rewards') < rewardsSlice.indexOf('menu-music-toggle'), 'El sonido debe quedar a la derecha de Recompensas Diarias.');
const menuButtonsStart = ui.indexOf('<div class="main-menu-buttons">');
const menuButtonsEnd = ui.indexOf('</div>', menuButtonsStart);
assert.doesNotMatch(ui.slice(menuButtonsStart, menuButtonsEnd), /menu-music-toggle/);

// Selects Admin: fondo oscuro + fuente gold para todo select dentro del overlay.
assert.match(ui, /#admin-panel-overlay select \{/);
assert.match(ui, /background-color:#0b130e !important; color:#f0d56a !important/);
assert.match(ui, /#admin-panel-overlay select option/);

console.log('COIN_UI_AUDIO_23_13_65_OK thickness=18 edgeSegments=56 sfx=once adminSelect=dark sound=daily-inline');
