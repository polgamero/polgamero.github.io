import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TRUSTED_CARD_POOL } from '../src/trusted/cardCatalog.js';
import { PUBLISHED_CARD_BASELINE_IDS, PUBLISHED_CARD_BASELINE_SET, PUBLISHED_CARD_BASELINE_VERSION } from '../src/trusted/publishedCardBaseline.js';

const publicationSource=fs.readFileSync(new URL('../src/trusted/cardPublication.js',import.meta.url),'utf8');
const commerceSource=fs.readFileSync(new URL('../src/economy/commerce.js',import.meta.url),'utf8');
const tradeSource=fs.readFileSync(new URL('../src/economy/trade.js',import.meta.url),'utf8');

test('23.21.5 freezes exactly the historical 880-card publication baseline', () => {
  assert.equal(PUBLISHED_CARD_BASELINE_VERSION,'23.21.4-880');
  assert.equal(PUBLISHED_CARD_BASELINE_IDS.length,880);
  assert.equal(new Set(PUBLISHED_CARD_BASELINE_IDS).size,880);
  assert.equal(TRUSTED_CARD_POOL.length,900);
  assert.equal(TRUSTED_CARD_POOL.filter(card=>PUBLISHED_CARD_BASELINE_SET.has(card.id)).length,880);
  assert.equal(TRUSTED_CARD_POOL.filter(card=>!PUBLISHED_CARD_BASELINE_SET.has(card.id)).length,20);
  assert.ok(TRUSTED_CARD_POOL.filter(card=>!PUBLISHED_CARD_BASELINE_SET.has(card.id)).every(card=>card.enabled===false),'all post-baseline Dragon cards ship explicitly disabled');
});

test('23.21.5 publication authority is fail-closed for future IDs and supports sparse overrides', () => {
  assert.match(publicationSource,/PUBLISHED_CARD_BASELINE_SET\.has\(id\)/);
  assert.match(publicationSource,/typeof explicit === 'boolean'/);
  assert.match(publicationSource,/if \(!TRUSTED_CARD_IDS\.has\(id\)\) return false/);
  assert.match(publicationSource,/CARD_DISABLED/);
});

test('23.21.5 commerce and Trade Market enforce CARD_DISABLED server-side', () => {
  assert.match(commerceSource,/assertCardEnabled\(card\.id, publication\)/);
  assert.match(commerceSource,/disabledPrebuiltProductIds/);
  assert.match(commerceSource,/assertCardEnabled\(cleanCardId, publication\)/);
  assert.match(tradeSource,/assertCardEnabled\(card\.id,publication\)/);
  assert.match(tradeSource,/cardEnabledByPolicy\(x\.cardId,publication\)/);
  assert.match(tradeSource,/assertCardEnabled\(accepted\.offeredCardId,publication\)/);
});
