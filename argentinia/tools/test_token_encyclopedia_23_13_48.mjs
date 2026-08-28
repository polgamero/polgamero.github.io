import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildTokenCatalog, collectTokenProducerEffects, tokenArtLayoutId } from '../js/tokenCatalog.js';
import { POOL_BASELINE } from '../js/poolContract.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const dataDir = path.join(root, 'assets', 'data');
const files = ['tierras','artefactos','criaturas','instantaneos','conjuros','encantamientos','planeswalkers'];
const cards = files.flatMap(name => JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`), 'utf8')));
const effects = collectTokenProducerEffects(cards);
const catalog = buildTokenCatalog(cards);

assert.equal(cards.length, POOL_BASELINE.total, `El catálogo de tokens no debe alterar el pool activo ${POOL_BASELINE.total}`);
assert.ok(effects.length >= 32, 'El pool acumulativo debe preservar al menos los 32 productores históricos');
assert.ok(catalog.length >= 25, 'El pool acumulativo debe preservar al menos las 25 identidades visuales históricas de token');
assert.equal(new Set(catalog.map(t => t.id)).size, catalog.length, 'IDs visuales de token duplicados');
assert.equal(catalog.filter(t => !t.image).length, 0, 'Todo token canónico debe tener filename');
for (const token of catalog) {
  assert.match(token.id, /^tokenart_[A-Za-z0-9_-]+$/);
  assert.equal(token.id, tokenArtLayoutId(token.image, token.name));
  assert.equal(token.isToken, true);
  assert.ok(token.tokenProducerCount >= 1);
}

console.log(`TOKEN_ENCYCLOPEDIA_23_13_48_OK producers=${effects.length} catalog=${catalog.length}`);
