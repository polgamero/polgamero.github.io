import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeStoreSettings,
  DEFAULT_CLASSIFIED_BASIC_LAND_PACK_PRICE,
  DEFAULT_CLASSIFIED_BASIC_LAND_PACK_QUANTITY,
  CLASSIFIED_BASIC_LAND_PACK_QUANTITY_HARD_MAX
} from '../src/economy/commerceCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = rel => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

test('23.21.4 basic-land pack defaults and Admin overrides are normalized server-side', () => {
  assert.equal(DEFAULT_CLASSIFIED_BASIC_LAND_PACK_PRICE, 150);
  assert.equal(DEFAULT_CLASSIFIED_BASIC_LAND_PACK_QUANTITY, 15);
  assert.equal(CLASSIFIED_BASIC_LAND_PACK_QUANTITY_HARD_MAX, 100);
  assert.deepEqual(
    Object.fromEntries(Object.entries(normalizeStoreSettings({})).filter(([k]) => k.startsWith('classifiedBasicLand'))),
    { classifiedBasicLandPackPrice:150, classifiedBasicLandPackQuantity:15 }
  );
  const custom = normalizeStoreSettings({ classifiedBasicLandPackPrice:90, classifiedBasicLandPackQuantity:25 });
  assert.equal(custom.classifiedBasicLandPackPrice, 90);
  assert.equal(custom.classifiedBasicLandPackQuantity, 25);
  assert.equal(normalizeStoreSettings({classifiedBasicLandPackQuantity:999}).classifiedBasicLandPackQuantity, 100);
});

test('23.21.4 exposes exactly five fixed WUBRG Common basic-land products', () => {
  const commerce = read('src/economy/commerce.js');
  for (const [color, cardId] of [['W','tier_001'],['U','tier_003'],['B','tier_009'],['R','tier_005'],['G','tier_007']]) {
    assert.ok(commerce.includes(`color:'${color}', cardId:'${cardId}'`));
  }
  assert.equal((commerce.match(/Object\.freeze\(\{ color:'/g) || []).length, 5);
  assert.match(commerce, /rarity\s*!==\s*'Common'/);
  assert.match(commerce, /tierra básica/i);
  assert.match(commerce, /Array\(quantity\)\.fill\(pack\.cardId\)/);
});

test('23.21.4 land-pack authority is its own exactly-once audited callable', () => {
  const index = read('src/index.js');
  const audit = read('src/economy/audit.js');
  assert.match(index, /economyPurchaseClassifiedBasicLandPack/);
  assert.match(index, /store\.purchase_basic_land_pack/);
  assert.match(index, /runIdempotentEconomyOperation|operationId/);
  assert.match(audit, /case 'store\.purchase_basic_land_pack'/);
  assert.match(audit, /classified_basic_land_pack_purchase_server/);
});
