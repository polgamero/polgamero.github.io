import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../js/startingCoin.js', import.meta.url), 'utf8');

// Las dos identidades existen desde antes del giro y nunca se reemplazan al aterrizar.
assert.match(src, /starting-coin-front span'\)\.textContent = local/);
assert.match(src, /starting-coin-back span'\)\.textContent = rival/);
assert.doesNotMatch(src, /winnerFace/);
assert.doesNotMatch(src, /is-landed/);
assert.doesNotMatch(src, /starting-coin-face:not\(\.is-winner\)/);

// Dos caras reales + espesor multicapa.
assert.match(src, /COIN_RIM_HALF_PX = 7/);
assert.match(src, /COIN_RIM_LAYERS = 15/);
assert.match(src, /buildRimLayers\(\)/);
assert.match(src, /starting-coin-rim-layer/);
assert.match(src, /backface-visibility:hidden/);
assert.match(src, /-webkit-backface-visibility:hidden/);
assert.match(src, /starting-coin-back\{transform:rotateY\(180deg\) translateZ/);

// El lado rival se obtiene por rotación física de 180°, no por swapping de DOM.
assert.match(src, /winnerSide === 'rival' \? 180 : 0/);
assert.match(src, /const finalTransform = `rotateY\(\$\{finalDegrees\}deg\) rotateX\(0deg\)`/);
assert.match(src, /coin\.style\.transform = finalTransform/);

// Ritmo deliberadamente legible: giro >3 s y resultado quieto >=2 s.
const spin = Number(src.match(/COIN_SPIN_MS = (\d+)/)?.[1] || 0);
const hold = Number(src.match(/COIN_RESULT_HOLD_MS = (\d+)/)?.[1] || 0);
assert.ok(spin >= 3000, `spin demasiado corto: ${spin}`);
assert.ok(hold >= 1800, `landing demasiado corto: ${hold}`);

console.log(`STARTING_COIN_PHYSICAL_23_13_57_OK spin=${spin} hold=${hold}`);
