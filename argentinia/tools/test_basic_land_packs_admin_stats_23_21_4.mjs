import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeGlobalTelemetry } from '../js/statistics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const argRoot = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(argRoot, 'build-manifest.json'), 'utf8'));

assert.equal(manifest.engineVersion, '23.21.4');
assert.equal(manifest.functionsCount, 41);
assert.match(manifest.label, /Basic Land Access.*Admin Statistics Dashboard/i);

const version = read('argentinia/js/version.js');
assert.match(version, /ENGINE_VERSION = '23\.21\.4'/);
const constants = read('functions/src/shared/constants.js');
assert.match(constants, /ENGINE_VERSION = '23\.21\.4'/);
assert.match(constants, /ECONOMY_PROTOCOL_VERSION = 'econ-23\.19\.5\.6'/);

const store = read('argentinia/js/store.js');
assert.match(store, /CLASSIFIEDS_BASIC_LAND_PACK_PRICE = 150/);
assert.match(store, /CLASSIFIEDS_BASIC_LAND_PACK_QUANTITY = 15/);
assert.match(store, /classifiedBasicLandPackPrice:\s*150/);
assert.match(store, /classifiedBasicLandPackQuantity:\s*15/);

const commerceCore = await import(path.join(repoRoot, 'functions/src/economy/commerceCore.js'));
assert.equal(commerceCore.normalizeStoreSettings({}).classifiedBasicLandPackPrice, 150);
assert.equal(commerceCore.normalizeStoreSettings({}).classifiedBasicLandPackQuantity, 15);
assert.equal(commerceCore.normalizeStoreSettings({classifiedBasicLandPackPrice:75, classifiedBasicLandPackQuantity:30}).classifiedBasicLandPackPrice, 75);
assert.equal(commerceCore.normalizeStoreSettings({classifiedBasicLandPackPrice:75, classifiedBasicLandPackQuantity:30}).classifiedBasicLandPackQuantity, 30);
assert.equal(commerceCore.normalizeStoreSettings({classifiedBasicLandPackQuantity:999}).classifiedBasicLandPackQuantity, 100);

const commerce = read('functions/src/economy/commerce.js');
for (const [color, cardId] of [['W','tier_001'],['U','tier_003'],['B','tier_009'],['R','tier_005'],['G','tier_007']]) {
  assert.ok(commerce.includes(`color:'${color}', cardId:'${cardId}'`), `${color} must map to ${cardId}`);
}
assert.match(commerce, /rarity\s*!==\s*'Common'/);
assert.match(commerce, /tierra básica/i);
assert.match(commerce, /argentinaWeekKey\(nowMs\)/);
assert.match(commerce, /Array\(quantity\)\.fill\(pack\.cardId\)/);
assert.match(commerce, /classifiedsBasicLandPackWeekKey/);
assert.match(commerce, /classifiedsBasicLandPacksPurchased/);

const fnIndex = read('functions/src/index.js');
assert.match(fnIndex, /export const economyPurchaseClassifiedBasicLandPack = onCall/);
assert.match(fnIndex, /store\.purchase_basic_land_pack/);
assert.match(fnIndex, /classified-land-pack/);

const audit = read('functions/src/economy/audit.js');
assert.match(audit, /case 'store\.purchase_basic_land_pack'/);
assert.match(audit, /basicLandPacksPurchased:1/);
assert.match(audit, /basicLandsReceived/);

const firebaseImpl = read('argentinia/js/firebaseClientImpl.js');
assert.match(firebaseImpl, /classifiedBasicLandPackPurchase:\s*'store\.purchase_basic_land_pack'/);
assert.match(firebaseImpl, /classifiedBasicLandPackPurchase:'classified-land'/);
assert.match(firebaseImpl, /purchaseClassifiedBasicLandPackServer/);

const ui = read('argentinia/js/ui.js');
assert.ok(ui.indexOf('classifieds-basic-land-section') > ui.indexOf('classifieds-strip'), 'basic land section must be separate and after normal Classifieds strip');
assert.match(ui, /classifiedBasicLandPackPrice/);
assert.match(ui, /classifiedBasicLandPackQuantity/);
assert.match(ui, /quantityBadge\.textContent\s*=\s*`×\$\{Math\.max\(1,/);
assert.match(ui, /exportAdminStatisticsCsv/);
assert.match(ui, /admin-chart-grid/);
assert.match(ui, /tournamentChampionships/);
assert.match(ui, /tradesCompleted/);
assert.match(ui, /basicLandPacksPurchased/);

const texts = read('argentinia/js/gameTexts.js');
assert.match(texts, /classifieds\.basicLands\.title/);
assert.match(texts, /PACKS DE TIERRAS BÁSICAS/);
assert.match(texts, /admin\.stats\.export/);

const sessions = [
  { id:'solo1', mode:'solo', status:'completed', startedAtClient:'2026-09-11T10:00:00Z', endedAtClient:'2026-09-11T10:10:00Z' },
  { id:'mp-a', matchId:'m1', mode:'multiplayer', status:'completed', startedAtClient:'2026-09-11T10:00:00Z', endedAtClient:'2026-09-11T10:15:00Z' },
  { id:'mp-b', matchId:'m1', mode:'multiplayer', status:'completed', startedAtClient:'2026-09-11T10:00:00Z', endedAtClient:'2026-09-11T10:15:00Z' },
  { id:'tour1', tournamentId:'t1', tournamentMatchId:'tm1', mode:'tournament', status:'completed', startedAtClient:'2026-09-11T10:00:00Z', endedAtClient:'2026-09-11T10:20:00Z' }
];
const global = summarizeGlobalTelemetry(sessions);
assert.equal(global.soloGames, 1);
assert.equal(global.multiplayerGames, 1);
assert.equal(global.tournamentGames, 1);
assert.equal(global.totalGames, 3);

console.log('PASS 23.21.4 Basic Land Access + Admin Statistics Dashboard contract');
