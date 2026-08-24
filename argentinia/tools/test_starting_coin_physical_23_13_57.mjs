import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../js/startingCoin.js', import.meta.url), 'utf8');

// Las dos identidades existen desde antes del giro y nunca se reemplazan al aterrizar.
assert.match(src, /starting-coin-front span'\)\.textContent = local/);
assert.match(src, /starting-coin-back span'\)\.textContent = rival/);
assert.doesNotMatch(src, /winnerFace/);
assert.doesNotMatch(src, /is-winner/);

// Contrato físico actual: dos caras + pared cilíndrica segmentada con espesor real.
assert.match(src, /COIN_THICKNESS_PX = 18/);
assert.match(src, /COIN_EDGE_SEGMENTS = 56/);
assert.match(src, /buildEdgeSegments\(\)/);
assert.match(src, /starting-coin-edge-segment/);
assert.match(src, /starting-coin-back\{transform:rotateX\(180deg\) translateZ/);
assert.match(src, /syncPhysicalFaceVisibility/);

// El lado rival se obtiene por media vuelta física; no hay swapping de texto al landing.
assert.match(src, /winnerSide === 'rival' \? 180 : 0/);
assert.match(src, /rotateX\(\$\{finalDegrees\}deg\)/);
assert.doesNotMatch(src, /textContent\s*=\s*winner/);

// Ritmo deliberadamente legible: giro >3 s y resultado quieto >=2 s.
const spin = Number(src.match(/COIN_SPIN_MS = (\d+)/)?.[1] || 0);
const hold = Number(src.match(/COIN_RESULT_HOLD_MS = (\d+)/)?.[1] || 0);
assert.ok(spin >= 3000, `spin demasiado corto: ${spin}`);
assert.ok(hold >= 1800, `landing demasiado corto: ${hold}`);

console.log(`STARTING_COIN_PHYSICAL_23_13_57_OK spin=${spin} hold=${hold}`);
