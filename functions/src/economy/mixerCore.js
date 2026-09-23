// HF23.3.15 — Mezcladora Industrial pure contracts.
import { seededRng } from '../shared/canonical.js';

export const INDUSTRIAL_MIX_RARITY_CHAIN = Object.freeze(['Common','Uncommon','Rare','Mythic']);
export const INDUSTRIAL_MIX_COPIES_CONSUMED = 3;

export function nextIndustrialMixRarity(rarity) {
  const idx = INDUSTRIAL_MIX_RARITY_CHAIN.indexOf(String(rarity || ''));
  return idx >= 0 && idx < INDUSTRIAL_MIX_RARITY_CHAIN.length - 1 ? INDUSTRIAL_MIX_RARITY_CHAIN[idx + 1] : null;
}


export function industrialMixFreeCopies({ owned = 0, protectedCopies = 0, reserved = 0 } = {}) {
  const physical = Math.max(0, Math.floor(Number(owned) || 0));
  const protectedFloor = Math.max(1, Math.floor(Number(protectedCopies) || 0));
  const marketReserved = Math.max(0, Math.floor(Number(reserved) || 0));
  return Math.max(0, physical - protectedFloor - marketReserved);
}

export function industrialMixPool(cardPool = [], sourceRarity) {
  const targetRarity = nextIndustrialMixRarity(sourceRarity);
  if (!targetRarity) return [];
  return (Array.isArray(cardPool) ? cardPool : []).filter(card => card?.id && card?.rarity === targetRarity);
}

export function generateIndustrialMixResult({ seed, sourceRarity, cardPool = [] } = {}) {
  const targetRarity = nextIndustrialMixRarity(sourceRarity);
  if (!targetRarity) throw new Error('INDUSTRIAL_MIX_MAX_RARITY');
  const pool = industrialMixPool(cardPool, sourceRarity);
  if (!pool.length) throw new Error('INDUSTRIAL_MIX_POOL_EMPTY');
  const rng = seededRng(`industrial-mix|${String(seed || '')}|${String(sourceRarity || '')}|${targetRarity}`);
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  const card = pool[index];
  if (!card?.id || card.rarity !== targetRarity) throw new Error('INDUSTRIAL_MIX_GENERATION_INVALID');
  return Object.freeze({ cardId:String(card.id), targetRarity, poolSize:pool.length });
}
