// v23.19.5.2 — pure commerce contracts shared by callable authority + QA.

export const DEFAULT_PACK_COST = 150;
export const DEFAULT_CRAFT_COST = 3;
export const DEFAULT_PREBUILT_POINTS = 1500;
export const DEFAULT_PREBUILT_FICHAS = 3;
export const DEFAULT_MAX_SAVED_DECKS = 12;
export const USERNAME_RENAME_COST = 1;

export const ENHANCEMENT_KEYWORDS = Object.freeze([
  'flying','trample','vigilance','haste','lifelink','deathtouch','firststrike','menace','reach','hexproof'
]);

export function intAtLeast(value, min, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.floor(n));
}
export function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
export function normalizeStoreSettings(raw = {}) {
  return Object.freeze({
    packCost: intAtLeast(raw.packCost, 0, DEFAULT_PACK_COST),
    craftCost: intAtLeast(raw.fichasPerEnhancement, 1, DEFAULT_CRAFT_COST),
    prebuiltPoints: intAtLeast(raw.prebuiltDeckPoints, 0, DEFAULT_PREBUILT_POINTS),
    prebuiltFichas: intAtLeast(raw.prebuiltDeckFichas, 0, DEFAULT_PREBUILT_FICHAS),
    maxSavedDecks: intAtLeast(raw.maxSavedDecks, 1, DEFAULT_MAX_SAVED_DECKS)
  });
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
export function buildCommerceCampaignEffects(events = [], nowMs = Date.now()) {
  let packDiscountPercent = 0;
  const activeEventIds = [];
  for (const event of Array.isArray(events) ? events : []) {
    if (!eventActive(event, nowMs)) continue;
    if (event.type === 'pack_discount') {
      activeEventIds.push(String(event.id || ''));
      packDiscountPercent = Math.max(packDiscountPercent, clamp(event.value, 0, 90, 0));
    }
  }
  return Object.freeze({
    packDiscountPercent: Math.round(packDiscountPercent),
    activeEventIds: activeEventIds.filter(Boolean).slice(0, 32)
  });
}
export function effectivePackPurchaseCost(baseCost, effects = {}) {
  const base = intAtLeast(baseCost, 0, DEFAULT_PACK_COST);
  const pct = clamp(effects?.packDiscountPercent, 0, 90, 0);
  return Math.max(0, Math.round(base * (1 - pct / 100)));
}
export function normalizeInventory(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    standardPacks: intAtLeast(source.standardPacks, 0, 0),
    guaranteedMythics: intAtLeast(source.guaranteedMythics, 0, 0)
  };
}
export function normalizeClassifiedCounts(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    Common: intAtLeast(source.Common, 0, 0),
    Uncommon: intAtLeast(source.Uncommon, 0, 0),
    Rare: intAtLeast(source.Rare, 0, 0),
    Mythic: intAtLeast(source.Mythic, 0, 0)
  };
}
export function nextClassifiedCounts(previous, rarity, reset = false) {
  const counts = reset ? normalizeClassifiedCounts(null) : normalizeClassifiedCounts(previous);
  if (!Object.hasOwn(counts, rarity)) throw new Error('CLASSIFIEDS_INVALID_RARITY');
  counts[rarity] += 1;
  if (counts.Common > 4 || counts.Uncommon > 2 || counts.Rare + counts.Mythic > 1) {
    throw new Error('CLASSIFIEDS_SLOT_LIMIT_REACHED');
  }
  return counts;
}

// Official Argentinia economy/calendar timezone = ART (UTC-3). Week rolls Monday 00:00 ART.
export function argentinaWeekKey(nowMs = Date.now()) {
  const shifted = new Date(Number(nowMs) - 3 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  const dow = shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay();
  const monday = new Date(Date.UTC(y, m, d - (dow - 1)));
  const pad = n => String(n).padStart(2, '0');
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth()+1)}-${pad(monday.getUTCDate())}`;
}
export function nextArgentinaWeekRotationIso(nowMs = Date.now()) {
  const shifted = new Date(Number(nowMs) - 3 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  const dow = shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay();
  const days = 8 - dow;
  // Monday 00:00 ART == Monday 03:00 UTC.
  return new Date(Date.UTC(y, m, d + days, 3, 0, 0, 0)).toISOString();
}
