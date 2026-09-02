import assert from 'node:assert/strict';
import { canonicalJson, requestDigest, seededRng } from '../src/shared/canonical.js';
import { validateUsername, usernameKeyFromName } from '../src/economy/usernames.js';
import { TRUSTED_CARD_POOL, TRUSTED_CARD_POOL_FINGERPRINT } from '../src/trusted/cardCatalog.js';
import { DECK_INTELLIGENCE_VERSION, buildCompetitiveDeck, getArchetypeDefinition, validateCompetitiveDeck } from '../src/trusted/deckIntelligence.js';

assert.equal(canonicalJson({b:2,a:1}),'{"a":1,"b":2}');
assert.equal(requestDigest({a:1,b:2}),requestDigest({b:2,a:1}));
assert.notEqual(requestDigest({a:1}),requestDigest({a:2}));

const good=validateUsername('Pibe del Sur');
assert.equal(good.ok,true);
assert.equal(good.usernameKey,usernameKeyFromName('Pibe del Sur'));
assert.equal(validateUsername('admin').ok,false);
assert.equal(validateUsername('x').ok,false);

assert.equal(TRUSTED_CARD_POOL.length,880);
assert.equal(DECK_INTELLIGENCE_VERSION,'23.19.5-di2');
assert.match(TRUSTED_CARD_POOL_FINGERPRINT,/^[a-f0-9]{64}$/);

const build=(seed)=>{
  const rng=seededRng(seed);
  const result=buildCompetitiveDeck(TRUSTED_CARD_POOL,['W','U'],{quality:'starter',rng,candidateCount:20,goldfishIterations:16});
  assert.equal(result.deck.length,60);
  assert.equal(validateCompetitiveDeck(result.deck,['W','U']).ok,true);
  const def=getArchetypeDefinition(result.report.archetypeId);
  assert.ok(result.report.creatureCount>=def.creatureFloor,`trusted starter creature floor ${result.report.creatureCount}/${def.creatureFloor}`);
  assert.ok(result.report.vehicleCount<=def.maxVehicles,`trusted starter vehicle cap ${result.report.vehicleCount}/${def.maxVehicles}`);
  return result.deck.map(c=>c.id);
};
assert.deepEqual(build('same-operation'),build('same-operation'));
assert.notDeepEqual(build('same-operation'),build('different-operation'));

console.log('ECONOMY_FUNCTIONS_FOUNDATION_UNIT_OK');
