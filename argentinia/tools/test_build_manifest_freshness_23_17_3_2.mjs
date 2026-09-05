import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../build-manifest.json', import.meta.url), 'utf8'));
const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

assert.equal(ENGINE_VERSION, '23.20.0');
assert.equal(FIRESTORE_RULES_VERSION, '23.13.80');
assert.equal(manifest.engineVersion, ENGINE_VERSION);
assert.equal(manifest.engineProtocolVersion, ENGINE_PROTOCOL_VERSION);
assert.equal(manifest.protocolVersion, ENGINE_PROTOCOL_VERSION, 'legacy alias must remain aligned during schema transition');
assert.equal(manifest.firestoreRulesVersion, FIRESTORE_RULES_VERSION);
assert.equal(manifest.pool, 880);
assert.equal(manifest.poolMilestone, 'pool_expansion_viii_880');
assert.ok(main.includes('manifest?.engineProtocolVersion ?? manifest?.protocolVersion ?? null'), 'freshness check must accept canonical and legacy protocol field names');
assert.ok(!main.includes('manifest?.engineVersion === ENGINE_VERSION && manifest?.engineProtocolVersion === ENGINE_PROTOCOL_VERSION'), 'old brittle comparison survived');

console.log('BUILD_MANIFEST_FRESHNESS_23_17_3_2_OK engine=23.19.2 protocol=canonical+legacy rules=23.13.80 pool=880');
