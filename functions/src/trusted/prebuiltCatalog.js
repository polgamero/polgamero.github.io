import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRUSTED_CARD_POOL } from './cardCatalog.js';

export const PREBUILT_DECKS_VERSION = '23.17.3';
const here = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(fs.readFileSync(path.join(here, 'prebuilt-decks.json'), 'utf8'));
const byId = new Map(TRUSTED_CARD_POOL.map(card => [card.id, card]));
function norm(v=''){ return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function isLand(card){ return norm(card?.type).includes('tierra'); }
function isBasicLand(card){ return isLand(card) && norm(card?.type).includes('basica'); }

function validateProduct(product) {
  if (!product?.id || !product?.name || !Array.isArray(product?.colors) || !Array.isArray(product?.cardIds)) {
    throw new Error('TRUSTED_PREBUILT_INVALID_SHAPE');
  }
  if (product.cardIds.length !== 60) throw new Error(`TRUSTED_PREBUILT_SIZE:${product.id}:${product.cardIds.length}`);
  const colors = [...new Set(product.colors.map(c => String(c).toUpperCase()))];
  if (colors.length < 1 || colors.length > 2 || colors.some(c => !'WUBRG'.includes(c))) throw new Error(`TRUSTED_PREBUILT_COLORS:${product.id}`);
  const counts = new Map();
  for (const cardId of product.cardIds) {
    const card = byId.get(String(cardId));
    if (!card) throw new Error(`TRUSTED_PREBUILT_CARD_MISSING:${product.id}:${cardId}`);
    const cardColors = Array.isArray(card.colors) ? card.colors : [];
    if (cardColors.some(c => !colors.includes(c))) throw new Error(`TRUSTED_PREBUILT_OFFCOLOR:${product.id}:${cardId}`);
    const count = (counts.get(cardId) || 0) + 1;
    counts.set(cardId, count);
    if (!isBasicLand(card)) {
      const max = isLand(card) ? 2 : 4;
      if (count > max) throw new Error(`TRUSTED_PREBUILT_COPIES:${product.id}:${cardId}:${count}`);
    }
  }
  return Object.freeze({
    id: String(product.id), name: String(product.name), colors: Object.freeze(colors),
    archetypeId: String(product.archetypeId || ''), archetypeLabel: String(product.archetypeLabel || ''),
    image: String(product.image || ''), cardIds: Object.freeze(product.cardIds.map(String))
  });
}

if (String(raw?.version || '') !== PREBUILT_DECKS_VERSION) throw new Error('TRUSTED_PREBUILT_VERSION_MISMATCH');
if (!Array.isArray(raw?.products) || raw.products.length !== 10) throw new Error('TRUSTED_PREBUILT_PRODUCT_COUNT');
const products = raw.products.map(validateProduct);
const ids = new Set(products.map(p => p.id));
if (ids.size !== products.length) throw new Error('TRUSTED_PREBUILT_DUPLICATE_ID');
export const TRUSTED_PREBUILT_PRODUCTS = Object.freeze(products);
export const TRUSTED_PREBUILT_BY_ID = Object.freeze(new Map(products.map(p => [p.id, p])));
