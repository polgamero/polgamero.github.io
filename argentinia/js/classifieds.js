// js/classifieds.js — Entrega 23.13.25
// Dominio puro de AVISOS CLASIFICADOS. No toca DOM ni Firebase.
//
// Reglas de selección semanal:
//   - 4 Common (máximo 1 Tierra entre esas cuatro)
//   - 2 Uncommon
//   - 1 slot premium: Rare o Mythic
//   - ningún cardId repetido dentro de la semana
//
// La selección es determinística a partir de weekKey + pool + schema: una misma semana y
// un mismo pool producen exactamente las mismas siete cartas en todos los clientes. La
// publicación server-trusted de esas semanas vive en gameConfig/classifiedsSchedule y la
// materializa únicamente el Admin; este módulo sólo define la matemática reproducible.

import { rewardWeekStartStamp, weekKeyFromDate } from './rewards.js';
import {
  CLASSIFIEDS_COMMON_POINTS,
  CLASSIFIEDS_COMMON_FICHAS,
  CLASSIFIEDS_UNCOMMON_POINTS,
  CLASSIFIEDS_UNCOMMON_FICHAS,
  CLASSIFIEDS_RARE_POINTS,
  CLASSIFIEDS_RARE_FICHAS,
  CLASSIFIEDS_MYTHIC_POINTS,
  CLASSIFIEDS_MYTHIC_FICHAS,
  CLASSIFIEDS_MYTHIC_CHANCE
} from './store.js';

export const CLASSIFIEDS_SCHEMA_VERSION = 1;
export const CLASSIFIEDS_ALGORITHM_VERSION = 1;
export const CLASSIFIEDS_COMMON_SLOTS = 4;
export const CLASSIFIEDS_UNCOMMON_SLOTS = 2;
export const CLASSIFIEDS_PREMIUM_SLOTS = 1;
export const CLASSIFIEDS_TOTAL_SLOTS = 7;
export const CLASSIFIEDS_MAX_COMMON_LANDS = 1;
export const CLASSIFIEDS_SCHEDULE_HORIZON_WEEKS = 26;
export const CLASSIFIEDS_SCHEDULE_HISTORY_WEEKS = 4;

const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;
const SAFE_WEEK_INSTANT_OFFSET_MS = 12 * 60 * 60 * 1000; // lunes 09:00 ART, lejos del borde

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fnv1a32(text) {
  let hash = 0x811c9dc5;
  const input = String(text ?? '');
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledCopy(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function assertCardPool(cards) {
  if (!Array.isArray(cards) || !cards.length) throw new Error('CLASSIFIEDS_CARD_POOL_EMPTY');
  const seen = new Set();
  for (const card of cards) {
    if (!card || typeof card.id !== 'string' || !card.id) throw new Error('CLASSIFIEDS_CARD_ID_INVALID');
    if (seen.has(card.id)) throw new Error(`CLASSIFIEDS_DUPLICATE_CARD_ID:${card.id}`);
    seen.add(card.id);
  }
  return cards;
}

export function isClassifiedsLand(card) {
  return String(card?.type || '').toLocaleLowerCase('es-AR').includes('tierra');
}

export function classifiedsPoolFingerprint(cards) {
  assertCardPool(cards);
  const canonical = cards
    .map(card => `${card.id}|${card.rarity || ''}|${card.type || ''}`)
    .sort()
    .join('\n');
  return fnv1a32(canonical).toString(16).padStart(8, '0');
}

export function getClassifiedsEconomySnapshot(config = null) {
  const read = (key, liveValue) => typeof config?.[key] === 'number' ? config[key] : liveValue;
  return {
    Common: {
      points: Math.max(0, Math.floor(Number(read('classifiedsCommonPoints', CLASSIFIEDS_COMMON_POINTS)) || 0)),
      fichas: Math.max(0, Math.floor(Number(read('classifiedsCommonFichas', CLASSIFIEDS_COMMON_FICHAS)) || 0))
    },
    Uncommon: {
      points: Math.max(0, Math.floor(Number(read('classifiedsUncommonPoints', CLASSIFIEDS_UNCOMMON_POINTS)) || 0)),
      fichas: Math.max(0, Math.floor(Number(read('classifiedsUncommonFichas', CLASSIFIEDS_UNCOMMON_FICHAS)) || 0))
    },
    Rare: {
      points: Math.max(0, Math.floor(Number(read('classifiedsRarePoints', CLASSIFIEDS_RARE_POINTS)) || 0)),
      fichas: Math.max(0, Math.floor(Number(read('classifiedsRareFichas', CLASSIFIEDS_RARE_FICHAS)) || 0))
    },
    Mythic: {
      points: Math.max(0, Math.floor(Number(read('classifiedsMythicPoints', CLASSIFIEDS_MYTHIC_POINTS)) || 0)),
      fichas: Math.max(0, Math.floor(Number(read('classifiedsMythicFichas', CLASSIFIEDS_MYTHIC_FICHAS)) || 0))
    },
    mythicChance: clamp(Number(read('classifiedsMythicChance', CLASSIFIEDS_MYTHIC_CHANCE)) || 0, 0, 1)
  };
}

export function classifiedsEconomyFingerprint(snapshot = getClassifiedsEconomySnapshot()) {
  const text = [
    snapshot.Common?.points, snapshot.Common?.fichas,
    snapshot.Uncommon?.points, snapshot.Uncommon?.fichas,
    snapshot.Rare?.points, snapshot.Rare?.fichas,
    snapshot.Mythic?.points, snapshot.Mythic?.fichas,
    Number(snapshot.mythicChance || 0).toFixed(8)
  ].join('|');
  return fnv1a32(text).toString(16).padStart(8, '0');
}

export function classifiedsWeekStartStamp(date = new Date()) {
  return rewardWeekStartStamp(date);
}

export function classifiedsWeekKey(date = new Date()) {
  return weekKeyFromDate(date);
}

export function dateFromClassifiedsWeekKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!match) return null;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function chooseCommons(pool, rng) {
  const shuffled = shuffledCopy(pool, rng);
  const selected = [];
  let landCount = 0;
  for (const card of shuffled) {
    const isLand = isClassifiedsLand(card);
    if (isLand && landCount >= CLASSIFIEDS_MAX_COMMON_LANDS) continue;
    selected.push(card);
    if (isLand) landCount++;
    if (selected.length === CLASSIFIEDS_COMMON_SLOTS) break;
  }
  if (selected.length !== CLASSIFIEDS_COMMON_SLOTS) throw new Error('CLASSIFIEDS_COMMON_POOL_TOO_SMALL');
  return selected;
}

function chooseCount(pool, count, rng, errorCode) {
  if (pool.length < count) throw new Error(errorCode);
  return shuffledCopy(pool, rng).slice(0, count);
}

function priceForRarity(rarity, economy) {
  const price = economy?.[rarity];
  if (!price) throw new Error(`CLASSIFIEDS_UNKNOWN_RARITY:${rarity}`);
  return { points: price.points, fichas: price.fichas };
}

export function buildWeeklyClassifieds(cards, date = new Date(), economy = getClassifiedsEconomySnapshot()) {
  assertCardPool(cards);
  const weekStart = classifiedsWeekStartStamp(date);
  const weekKey = classifiedsWeekKey(date);
  const poolFingerprint = classifiedsPoolFingerprint(cards);
  const seed = fnv1a32(`argentinia-classifieds-v${CLASSIFIEDS_ALGORITHM_VERSION}|${weekKey}|${poolFingerprint}`);
  const rng = mulberry32(seed);

  const commons = cards.filter(card => card.rarity === 'Common');
  const uncommons = cards.filter(card => card.rarity === 'Uncommon');
  const rares = cards.filter(card => card.rarity === 'Rare');
  const mythics = cards.filter(card => card.rarity === 'Mythic');

  const commonCards = chooseCommons(commons, rng);
  const uncommonCards = chooseCount(uncommons, CLASSIFIEDS_UNCOMMON_SLOTS, rng, 'CLASSIFIEDS_UNCOMMON_POOL_TOO_SMALL');
  const useMythic = mythics.length > 0 && (rares.length === 0 || rng() < clamp(Number(economy.mythicChance) || 0, 0, 1));
  const premiumPool = useMythic ? mythics : rares;
  const [premiumCard] = chooseCount(premiumPool, 1, rng, 'CLASSIFIEDS_PREMIUM_POOL_TOO_SMALL');

  const selectedCards = [...commonCards, ...uncommonCards, premiumCard];
  const ids = new Set(selectedCards.map(card => card.id));
  if (ids.size !== CLASSIFIEDS_TOTAL_SLOTS) throw new Error('CLASSIFIEDS_DUPLICATE_SELECTION');

  const entries = selectedCards.map((card, slot) => ({
    slot,
    cardId: card.id,
    rarity: card.rarity,
    isLand: isClassifiedsLand(card),
    ...priceForRarity(card.rarity, economy)
  }));

  return {
    schemaVersion: CLASSIFIEDS_SCHEMA_VERSION,
    algorithmVersion: CLASSIFIEDS_ALGORITHM_VERSION,
    weekKey,
    weekStart,
    poolFingerprint,
    economyFingerprint: classifiedsEconomyFingerprint(economy),
    mythicChanceUsed: clamp(Number(economy.mythicChance) || 0, 0, 1),
    entries
  };
}

export function serializeClassifiedsWeek(offer) {
  if (!offer || !Array.isArray(offer.entries) || offer.entries.length !== CLASSIFIEDS_TOTAL_SLOTS) {
    throw new Error('CLASSIFIEDS_WEEK_INVALID');
  }
  const cardIds = offer.entries.map(entry => entry.cardId);
  const rarities = {};
  const prices = {};
  for (const entry of offer.entries) {
    rarities[entry.cardId] = entry.rarity;
    if (!prices[entry.rarity]) prices[entry.rarity] = { points: entry.points, fichas: entry.fichas };
  }
  return {
    weekStart: offer.weekStart,
    cardIds,
    rarities,
    prices,
    premiumRarity: offer.entries[CLASSIFIEDS_TOTAL_SLOTS - 1].rarity,
    poolFingerprint: offer.poolFingerprint,
    economyFingerprint: offer.economyFingerprint,
    algorithmVersion: offer.algorithmVersion
  };
}

export function buildClassifiedsScheduleWindow(cards, now = new Date(), economy = getClassifiedsEconomySnapshot(), {
  historyWeeks = CLASSIFIEDS_SCHEDULE_HISTORY_WEEKS,
  horizonWeeks = CLASSIFIEDS_SCHEDULE_HORIZON_WEEKS
} = {}) {
  assertCardPool(cards);
  const currentStart = classifiedsWeekStartStamp(now);
  const weeks = {};
  for (let offset = -Math.max(0, historyWeeks); offset <= Math.max(0, horizonWeeks); offset++) {
    // rewardWeekStartStamp representa la FECHA oficial como 00:00Z, no un instante ART.
    // Al volver a pasarla por el conversor ART usamos mediodía UTC para no caer 3 h atrás
    // en domingo y seleccionar accidentalmente la semana anterior.
    const weekDate = new Date(currentStart.getTime() + offset * WEEK_MS + SAFE_WEEK_INSTANT_OFFSET_MS);
    const offer = buildWeeklyClassifieds(cards, weekDate, economy);
    weeks[offer.weekKey] = serializeClassifiedsWeek(offer);
  }
  return {
    schemaVersion: CLASSIFIEDS_SCHEMA_VERSION,
    algorithmVersion: CLASSIFIEDS_ALGORITHM_VERSION,
    poolFingerprint: classifiedsPoolFingerprint(cards),
    economyFingerprint: classifiedsEconomyFingerprint(economy),
    weeks
  };
}

export function getScheduledClassifiedsWeek(schedule, date = new Date()) {
  const weekKey = classifiedsWeekKey(date);
  const week = schedule?.weeks?.[weekKey] || null;
  return week ? { weekKey, ...week } : null;
}

function timestampLikeToDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof value?.seconds === 'number') {
    const d = new Date(value.seconds * 1000 + Math.floor((Number(value.nanoseconds) || 0) / 1e6));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizeClassifiedsPurchaseCounts(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    Common: Math.max(0, Math.floor(Number(source.Common) || 0)),
    Uncommon: Math.max(0, Math.floor(Number(source.Uncommon) || 0)),
    Rare: Math.max(0, Math.floor(Number(source.Rare) || 0)),
    Mythic: Math.max(0, Math.floor(Number(source.Mythic) || 0))
  };
}

export function getClassifiedsProfileState(profile, weekKey) {
  const sameWeek = String(profile?.classifiedsWeekKey || '') === String(weekKey || '');
  return {
    weekKey: String(weekKey || ''),
    purchased: sameWeek && Array.isArray(profile?.classifiedsPurchased)
      ? [...new Set(profile.classifiedsPurchased.filter(id => typeof id === 'string' && id))]
      : [],
    counts: sameWeek ? normalizeClassifiedsPurchaseCounts(profile?.classifiedsPurchaseCounts) : normalizeClassifiedsPurchaseCounts(null),
    lastPurchase: sameWeek && profile?.classifiedsLastPurchase && typeof profile.classifiedsLastPurchase === 'object'
      ? { ...profile.classifiedsLastPurchase }
      : null
  };
}

export function countOwnedClassifiedCard(profile, cardId) {
  return Array.isArray(profile?.collection)
    ? profile.collection.reduce((count, id) => count + (id === cardId ? 1 : 0), 0)
    : 0;
}

export function validateClassifiedsScheduleWeek(week, cardDbLike = null) {
  if (!week || !Array.isArray(week.cardIds) || week.cardIds.length !== CLASSIFIEDS_TOTAL_SLOTS) return false;
  if (new Set(week.cardIds).size !== CLASSIFIEDS_TOTAL_SLOTS) return false;
  if (!week.rarities || typeof week.rarities !== 'object') return false;
  const rarities = week.cardIds.map(id => week.rarities[id]);
  if (rarities.filter(r => r === 'Common').length !== CLASSIFIEDS_COMMON_SLOTS) return false;
  if (rarities.filter(r => r === 'Uncommon').length !== CLASSIFIEDS_UNCOMMON_SLOTS) return false;
  if (rarities.filter(r => r === 'Rare' || r === 'Mythic').length !== CLASSIFIEDS_PREMIUM_SLOTS) return false;
  if (cardDbLike?.getById) {
    for (const id of week.cardIds) {
      const card = cardDbLike.getById(id);
      if (!card || card.rarity !== week.rarities[id]) return false;
    }
    const commonLands = week.cardIds
      .filter(id => week.rarities[id] === 'Common')
      .map(id => cardDbLike.getById(id))
      .filter(isClassifiedsLand).length;
    if (commonLands > CLASSIFIEDS_MAX_COMMON_LANDS) return false;
  }
  return true;
}

export function nextClassifiedsWeekDate(date = new Date()) {
  return new Date(classifiedsWeekStartStamp(date).getTime() + WEEK_MS + SAFE_WEEK_INSTANT_OFFSET_MS);
}

export function weeksApart(fromWeekKey, toWeekKey) {
  const from = dateFromClassifiedsWeekKey(fromWeekKey);
  const to = dateFromClassifiedsWeekKey(toWeekKey);
  if (!from || !to) return NaN;
  return Math.round((to.getTime() - from.getTime()) / WEEK_MS);
}
