import crypto from 'node:crypto';
import { TRUSTED_CARD_POOL } from '../trusted/cardCatalog.js';
import { seededRng } from '../shared/canonical.js';

export const PACK_COMMONS = 9;
export const PACK_UNCOMMONS = 4;
export const PACK_LANDS = 1;
export const PACK_SIZE = PACK_COMMONS + PACK_UNCOMMONS + PACK_LANDS + 1;
export const DEFAULT_MYTHIC_CHANCE = 1 / 7;

const CARD_POOLS = Object.freeze({
  Common: Object.freeze(TRUSTED_CARD_POOL.filter(card => card?.rarity === 'Common')),
  Uncommon: Object.freeze(TRUSTED_CARD_POOL.filter(card => card?.rarity === 'Uncommon')),
  Rare: Object.freeze(TRUSTED_CARD_POOL.filter(card => card?.rarity === 'Rare')),
  Mythic: Object.freeze(TRUSTED_CARD_POOL.filter(card => card?.rarity === 'Mythic')),
  Land: Object.freeze(TRUSTED_CARD_POOL.filter(card => String(card?.type || '').toLowerCase().includes('tierra')))
});
for (const [name, pool] of Object.entries(CARD_POOLS)) if (!pool.length) throw new Error(`TRUSTED_PACK_POOL_EMPTY:${name}`);

export function clamp(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function timestampMs(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1e6);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function eventActive(event, nowMs) {
  if (!event || event.finalizedAt || event.finalized === true) return false;
  const start = timestampMs(event.startAt);
  const end = timestampMs(event.endAt);
  if (start && nowMs < start) return false;
  if (end && nowMs >= end) return false;
  return true;
}
export function buildPackCampaignEffects(events = [], nowMs = Date.now()) {
  let allFichasMultiplier = 1;
  let packOpenFichaBonus = 0;
  const activeEventIds = [];
  for (const event of Array.isArray(events) ? events : []) {
    if (!eventActive(event, nowMs)) continue;
    activeEventIds.push(String(event.id || ''));
    const value = Math.max(0, Number(event.value) || 0);
    if (event.type === 'all_fichas_multiplier') allFichasMultiplier = Math.max(allFichasMultiplier, value || 1);
    if (event.type === 'pack_open_ficha_bonus') packOpenFichaBonus += Math.max(0, Math.floor(value));
  }
  return { allFichasMultiplier, packOpenFichaBonus, activeEventIds: activeEventIds.filter(Boolean).slice(0, 32) };
}
export function effectivePackOpenFichas(effects) {
  const mult = Math.max(1, Number(effects?.allFichasMultiplier) || 1);
  const bonus = Math.max(0, Math.floor(Number(effects?.packOpenFichaBonus) || 0));
  return Math.round(mult) + bonus;
}
function pick(pool, rng) { return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]; }
export function createServerEntropy() {
  const seed = crypto.randomBytes(32).toString('hex');
  return { seed, commitment: crypto.createHash('sha256').update(seed).digest('hex') };
}
export function generateTrustedPack({ seed, mythicChance = DEFAULT_MYTHIC_CHANCE }) {
  const rng = seededRng(`pack|${String(seed || '')}`);
  const cards = [];
  for (let i = 0; i < PACK_COMMONS; i++) cards.push(pick(CARD_POOLS.Common, rng));
  for (let i = 0; i < PACK_UNCOMMONS; i++) cards.push(pick(CARD_POOLS.Uncommon, rng));
  const mythic = CARD_POOLS.Mythic.length > 0 && rng() < clamp(mythicChance, 0, 1, DEFAULT_MYTHIC_CHANCE);
  cards.push(pick(mythic ? CARD_POOLS.Mythic : CARD_POOLS.Rare, rng));
  for (let i = 0; i < PACK_LANDS; i++) cards.push(pick(CARD_POOLS.Land, rng));
  if (cards.length !== PACK_SIZE) throw new Error('PACK_GENERATION_INVALID');
  return { cardIds: cards.map(card => card.id), rareSlotRarity: mythic ? 'Mythic' : 'Rare' };
}
export function generateTrustedGuaranteedMythic({ seed }) {
  const rng = seededRng(`mythic|${String(seed || '')}`);
  const card = pick(CARD_POOLS.Mythic, rng);
  if (!card?.id || card.rarity !== 'Mythic') throw new Error('MYTHIC_GENERATION_INVALID');
  return card.id;
}
