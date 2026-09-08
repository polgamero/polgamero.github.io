import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const repo=path.resolve(root,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const manifest=JSON.parse(read('build-manifest.json'));
assert.equal(manifest.engineVersion,'23.21.3');
assert.equal(manifest.economyProtocolVersion,'econ-23.19.5.6');
assert.equal(manifest.economySchemaVersion,10);
assert.equal(manifest.firestoreRulesVersion,'23.13.85');
assert.equal(manifest.pool,880);

const ui=read('js/ui.js');
const texts=read('js/gameTexts.js');
const client=read('js/economyClient.js');
const firebase=read('js/firebaseClient.js');
const impl=read('js/firebaseClientImpl.js');
const fn=fs.readFileSync(path.join(repo,'functions','src','index.js'),'utf8');
const core=fs.readFileSync(path.join(repo,'functions','src','economy','tradeCore.js'),'utf8');
const trade=fs.readFileSync(path.join(repo,'functions','src','economy','trade.js'),'utf8');
const audit=fs.readFileSync(path.join(repo,'functions','src','economy','audit.js'),'utf8');
const store=read('js/store.js');

assert.match(ui,/id="menu-trade-market"/);
assert.match(ui,/showTradeMarketScreen/);
assert.match(texts,/menu\.tradeMarket/);
assert.match(texts,/trade\.rarity\.Mythic/);
assert.match(texts,/trade\.color\.R/);
assert.match(texts,/trade\.acceptAny/);
assert.match(texts,/trade\.confirm\.acceptSwap/);
assert.match(texts,/trade\.history\.none/);
assert.match(core,/maxWantedCriteria:\s*3/);
assert.match(core,/maxOffersPerListing:\s*10/);
assert.match(core,/maxOutgoingOffers:\s*5/);
assert.match(core,/maxCompletedPerWeek:\s*3/);
assert.match(core,/normalizeTradeLimits/);
for(const field of ['tradeMaxWantedCriteria','tradeMaxOffersPerListing','tradeMaxOutgoingOffers','tradeMaxCompletedPerWeek']){
  assert.match(store,new RegExp(field));
  assert.match(ui,new RegExp(`id: '${field}'`));
}
assert.match(audit,/tradesCompleted/);
assert.match(trade,/playerStatsMirrorServer/);
assert.match(trade,/trade_market_complete_server/);
assert.match(trade,/economyEvents/);
assert.match(ui,/admin\.stats\.trades\.label/);
assert.match(ui,/admin\.audit\.operation\.tradeComplete/);
assert.match(core,/Math\.max\(maxDeckCopies, enhancedProtected\)/);
assert.match(core,/criterion\.color === 'C'/);
assert.match(core,/colors\.includes\(criterion\.color\)/);
assert.match(trade,/tradableCardCount/);
assert.match(trade,/reservationsStillBacked/);
assert.match(trade,/swapOneCard/);
assert.match(trade,/tradeWeeklyLedgers/);
assert.match(trade,/tradeReceipts/);
assert.match(trade,/tradeReservations/);
assert.match(trade,/closeOneOfferTx\(\{db,tx,uid,offerId,mode,nowMs=Date\.now\(\)\}\)/);
for(const name of ['economyGetTradeMarket','economyCreateTradeListing','economyCancelTradeListing','economyCreateTradeOffer','economyCancelTradeOffer','economyRejectTradeOffer','economyAcceptTradeOffer']){
  assert.match(fn,new RegExp(`export const ${name}\\s*=\\s*onCall`));
  assert.ok(client.includes(name.replace(/^economy/,'').replace(/^GetTradeMarket$/,'getTradeMarket')) || fn.includes(name));
}
for(const name of ['getTradeMarket','createTradeListing','cancelTradeListing','createTradeOffer','cancelTradeOffer','rejectTradeOffer','acceptTradeOffer']){
  assert.match(firebase,new RegExp(`export const ${name} = asyncProxy\\('${name}'\\)`));
  assert.match(impl,new RegExp(`export async function ${name}\\(`));
}

// GitHubSource must remain independently testable and intentionally carries no deployable
// Firestore config. Rules 23.13.85 is certified by Gate 03 in the ordered package; here we
// assert only the source-side contract/version so CI never depends on a sibling delivery folder.
const version=read('js/version.js');
const sourceManifest=fs.readFileSync(path.join(repo,'SOURCE_SNAPSHOT_MANIFEST_23_21_3.txt'),'utf8');
assert.match(version,/FIRESTORE_RULES_VERSION = '23\.13\.85'/);
assert.match(sourceManifest,/DIRECT_FIRESTORE_FIREWALL=(?:CANDIDATE|DEPLOYED)_RULES_23\.13\.85/);
assert.match(sourceManifest,/TRADE_RESERVATIONS=SERVER_ONLY/);

const callables=[...fn.matchAll(/export const \w+\s*=\s*onCall\(/g)];
assert.equal(callables.length,40);
console.log('TRADE_MARKET_23_21_0_OK');
