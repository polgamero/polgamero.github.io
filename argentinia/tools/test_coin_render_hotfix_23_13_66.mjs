import assert from 'node:assert/strict';
import fs from 'node:fs';

const coin = fs.readFileSync(new URL('../js/startingCoin.js', import.meta.url), 'utf8');
const version = fs.readFileSync(new URL('../js/version.js', import.meta.url), 'utf8');

assert.ok(version.includes("ENGINE_VERSION = '23.13.66'"));
assert.match(coin, /COIN_THICKNESS_PX = 24/);
assert.match(coin, /COIN_EDGE_SEGMENTS = 64/);
assert.match(coin, /rotateX\(\$\{spinDegrees\}deg\)/);
assert.match(coin, /winnerSide === 'rival' \? 180 : 0/);

// Regresión crítica: ningún filter puede vivir sobre el contenedor 3D de la moneda.
// Chrome puede aplanar sus hijos y hacer desaparecer la cara rival / el canto.
assert.doesNotMatch(coin, /\.starting-coin\{[^}]*filter\s*:/s);
assert.doesNotMatch(coin, /\.starting-coin\.has-landed\{[^}]*filter\s*:/s);
assert.doesNotMatch(coin, /\.starting-coin-edge-segment[^}]*filter\s*:/s);

// El culling manual es la única autoridad de visibilidad de las dos identidades.
assert.match(coin, /backface-visibility:visible;-webkit-backface-visibility:visible;will-change:opacity,visibility/);
assert.match(coin, /frontFace\?\.classList\.toggle\('is-camera-visible', frontVisible\)/);
assert.match(coin, /backFace\?\.classList\.toggle\('is-camera-visible', backVisible\)/);
assert.match(coin, /starting-coin-front is-camera-visible/);
assert.match(coin, /starting-coin-back is-camera-hidden/);

// Ambas identidades existen desde el primer frame y no se cambian al final.
assert.match(coin, /starting-coin-front span'\)\.textContent = local/);
assert.match(coin, /starting-coin-back span'\)\.textContent = rival/);
assert.doesNotMatch(coin, /winnerFace|is-winner/);

// Canto reforzado y delimitado físicamente.
assert.match(coin, /border-top:2px solid rgba\(255,228,125,.68\)/);
assert.match(coin, /border-bottom:2px solid rgba\(55,29,2,.78\)/);

console.log('COIN_RENDER_HOTFIX_23_13_66_OK rival=physical-face edge=24 no-parent-filter');
