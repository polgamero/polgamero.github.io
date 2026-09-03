import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION,
  ECONOMY_PROTOCOL_VERSION, ECONOMY_SCHEMA_VERSION, ECONOMY_FUNCTIONS_REGION
} from '../js/version.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const appRoot=path.resolve(here,'..');
const repoRoot=path.resolve(appRoot,'..');
const read=(p)=>fs.readFileSync(path.join(repoRoot,p),'utf8');

assert.equal(ENGINE_VERSION,'23.19.5.4');
assert.equal(ENGINE_PROTOCOL_VERSION,'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(ECONOMY_PROTOCOL_VERSION,'econ-23.19.5.4');
assert.equal(ECONOMY_SCHEMA_VERSION,5);
assert.equal(ECONOMY_FUNCTIONS_REGION,'southamerica-east1');

const manifest=JSON.parse(read('argentinia/build-manifest.json'));
assert.equal(manifest.engineVersion,'23.19.5.4');
assert.equal(manifest.economyProtocolVersion,'econ-23.19.5.4');
assert.equal(manifest.economyFunctionsRegion,'southamerica-east1');
assert.equal(manifest.firestoreRulesVersion,'23.13.79');
assert.equal(manifest.pool,880);

const firebaseImpl=read('argentinia/js/firebaseClientImpl.js');
const economyClient=read('argentinia/js/economyClient.js');
const main=read('argentinia/js/main.js');
const fnConstants=read('functions/src/shared/constants.js');
const fnIndex=read('functions/src/index.js');
const ledger=read('functions/src/economy/operationLedger.js');
const accounts=read('functions/src/economy/accounts.js');
const rateLimit=read('functions/src/shared/rateLimit.js');
const fnPackage=JSON.parse(read('functions/package.json'));

assert.match(firebaseImpl,/ReCaptchaEnterpriseProvider/);
assert.match(firebaseImpl,/6LeHl6MtAAAAAHWzciQAQS_jDNOzXO7QU9FL35JX/);
assert.match(firebaseImpl,/isTokenAutoRefreshEnabled:\s*true/);
assert.match(firebaseImpl,/mode:\s*'shadow'/);
assert.match(firebaseImpl,/server_preferred/);
assert.match(firebaseImpl,/server_required/);
assert.match(firebaseImpl,/bootstrapAccountServer/);
assert.match(firebaseImpl,/completeStarterDeckServer/);
assert.match(main,/createUserProfile\([^\n]+deckSource\.identity\)/);
assert.match(main,/createUserProfile\([^\n]+chosenIdentity\)/);

assert.match(economyClient,/southamerica-east1/);
assert.match(economyClient,/economyBootstrapAccount/);
assert.match(economyClient,/economyCompleteStarterDeck/);
assert.match(economyClient,/economyGetOperation/);
assert.match(economyClient,/economyProtocolVersion/);

assert.equal(fnPackage.engines.node,'22');
assert.equal(fnPackage.dependencies['firebase-functions'],'7.3.2');
assert.equal(fnPackage.dependencies['firebase-admin'],'14.3.0');
assert.match(fnConstants,/minInstances:\s*0/);
assert.match(fnConstants,/maxInstances:\s*1/);
assert.match(fnConstants,/concurrency:\s*10/);
assert.match(fnConstants,/enforceAppCheck:\s*false/);
assert.match(rateLimit,/zero-Firestore-cost throttle/);
assert.match(fnIndex,/assertRateLimit\(auth\.uid, 'bootstrap'/);
assert.match(fnIndex,/assertRateLimit\(auth\.uid, 'starter'/);

assert.match(fnIndex,/requireAuth\(request\)/);
assert.match(fnIndex,/assertEconomyAvailable/);
assert.match(fnIndex,/rejectForbidden\(data, \['uid','points','fichas','collection','decks','inventory','enhancements','starterCardIds','cardIds'\]\)/);
assert.match(ledger,/requestDigest/);
assert.match(ledger,/OPERATION_ID_PAYLOAD_MISMATCH/);
assert.match(ledger,/status:\s*'committed'/);
assert.match(accounts,/buildCompetitiveDeck\(TRUSTED_CARD_POOL/);
assert.match(accounts,/quality:\s*'starter'/);
assert.match(accounts,/starterCardIds/);

const files=['tierras.json','artefactos.json','criaturas.json','instantaneos.json','conjuros.json','encantamientos.json','planeswalkers.json'];
let count=0;
for(const file of files){
  const browser=read(`argentinia/assets/data/${file}`);
  const server=read(`functions/src/trusted/cards/${file}`);
  assert.equal(server,browser,`${file} trusted snapshot must be byte-identical`);
  count+=JSON.parse(server).length;
}
assert.equal(count,880);
assert.equal(
  crypto.createHash('sha256').update(read('functions/src/trusted/deckIntelligence.js')).digest('hex'),
  crypto.createHash('sha256').update(read('argentinia/js/deckIntelligence.js')).digest('hex'),
  'server starter builder must snapshot the exact browser Deck Intelligence engine'
);

console.log('ECONOMY_AUTHORITY_FOUNDATION_23_19_5_OK');
console.log('region=southamerica-east1 node=22 minInstances=0 maxInstances=1 appCheck=OBSERVE_ONLY operationLedger=IDEMPOTENT secureBootstrap=SERVER_READY pool=880 rules=23.13.79');
