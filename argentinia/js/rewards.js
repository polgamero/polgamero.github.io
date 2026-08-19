// js/rewards.js — Entrega 23.13.2
// Dominio puro para recompensas semanales y Mi Cofre. No toca DOM ni Firebase.
// 23.13.2: el calendario deja de depender del reloj/dispositivo. El cliente recibe un
// instante autoritativo de Firestore y todas estas funciones lo interpretan en la zona
// oficial de Argentinia (UTC-3). Las Security Rules vuelven a validar la misma fecha.


export const REWARD_TIMEZONE_OFFSET_MINUTES = -180; // Argentina/ART fija para el pase.
export const DAILY_REWARDS_SCHEMA_VERSION = 2;

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

function officialShiftedDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new Error('INVALID_REWARD_DATE');
  return new Date(d.getTime() + REWARD_TIMEZONE_OFFSET_MINUTES * 60000);
}

function officialParts(date = new Date()) {
  const shifted = officialShiftedDate(date);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay() // lunes=1 ... domingo=7
  };
}

export function rewardDayStamp(date = new Date()) {
  const p = officialParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0, 0));
}

export function rewardWeekStartStamp(date = new Date()) {
  const p = officialParts(date);
  const day = rewardDayStamp(date);
  day.setUTCDate(day.getUTCDate() - (p.dayOfWeek - 1));
  return day;
}

export function hasAuthoritativeDailyState(raw) {
  return !!(raw && typeof raw === 'object'
    && Number(raw.schemaVersion) >= DAILY_REWARDS_SCHEMA_VERSION
    && timestampLikeToDate(raw.serverWeekStartAt)
    && timestampLikeToDate(raw.serverLastLoginDay));
}

export function serializeDailyRewardsForFirestore(state, authoritativeNow, serverTimestampValue) {
  const normalized = normalizeDailyRewardsState(state, authoritativeNow);
  return {
    schemaVersion: DAILY_REWARDS_SCHEMA_VERSION,
    serverWeekStartAt: rewardWeekStartStamp(authoritativeNow),
    serverLastLoginDay: rewardDayStamp(authoritativeNow),
    serverUpdatedAt: serverTimestampValue,
    streak: normalized.streak,
    unlockedDays: normalized.unlockedDays.slice(),
    claimedDays: normalized.claimedDays.slice(),
    lastClaimedDay: Number.isInteger(Number(normalized.lastClaimedDay)) ? Number(normalized.lastClaimedDay) : null
  };
}

export const CHEST_ITEM_KEYS = Object.freeze({
  standardPack: 'standardPacks',
  guaranteedMythic: 'guaranteedMythics'
});

// Balance inicial acordado para el pase de 7 logins consecutivos. Está deliberadamente
// concentrado al final: los primeros días dan progreso visible sin regalar un sobre entero,
// el día 6 ya se siente fuerte y el día 7 tiene un premio único de colección.
export const DAILY_REWARD_SCHEDULE = Object.freeze([
  { day: 1, rewards: Object.freeze([{ type: 'points', amount: 30 }]) },
  { day: 2, rewards: Object.freeze([{ type: 'points', amount: 30 }]) },
  { day: 3, rewards: Object.freeze([{ type: 'points', amount: 30 }]) },
  { day: 4, rewards: Object.freeze([{ type: 'fichas', amount: 1 }]) },
  { day: 5, rewards: Object.freeze([{ type: 'points', amount: 60 }]) },
  { day: 6, rewards: Object.freeze([
    { type: 'standardPack', amount: 1 },
    { type: 'points', amount: 100 }
  ]) },
  { day: 7, rewards: Object.freeze([{ type: 'guaranteedMythic', amount: 1 }]) }
]);

export function defaultInventory() {
  return {
    [CHEST_ITEM_KEYS.standardPack]: 0,
    [CHEST_ITEM_KEYS.guaranteedMythic]: 0
  };
}

export function normalizeInventory(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    [CHEST_ITEM_KEYS.standardPack]: Math.max(0, Math.floor(Number(source[CHEST_ITEM_KEYS.standardPack]) || 0)),
    [CHEST_ITEM_KEYS.guaranteedMythic]: Math.max(0, Math.floor(Number(source[CHEST_ITEM_KEYS.guaranteedMythic]) || 0))
  };
}

function pad2(n) { return String(n).padStart(2, '0'); }

// Mantiene el nombre histórico por compatibilidad, pero desde 23.13.2 significa
// "fecha oficial de Recompensas" (ART/UTC-3), NO la fecha local del dispositivo.
export function localDateKey(date = new Date()) {
  const p = officialParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function weekKeyFromDate(date = new Date()) {
  const monday = rewardWeekStartStamp(date);
  return `${monday.getUTCFullYear()}-${pad2(monday.getUTCMonth() + 1)}-${pad2(monday.getUTCDate())}`;
}

function dateKeyToUtcMs(key) {
  const [y, m, d] = String(key || '').split('-').map(Number);
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
}

export function calendarDayDiff(fromKey, toKey) {
  const a = dateKeyToUtcMs(fromKey);
  const b = dateKeyToUtcMs(toKey);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return Math.round((b - a) / 86400000);
}

export function defaultDailyRewardsState(date = new Date()) {
  return {
    weekKey: weekKeyFromDate(date),
    lastLoginDate: null,
    streak: 0,
    unlockedDays: [],
    claimedDays: [],
    lastClaimedDay: null,
    schemaVersion: 0,
    serverWeekStartAt: null,
    serverLastLoginDay: null,
    serverUpdatedAt: null
  };
}

export function normalizeDailyRewardsState(raw, date = new Date()) {
  const base = defaultDailyRewardsState(date);
  if (!raw || typeof raw !== 'object') return base;
  const unlockedDays = Array.isArray(raw.unlockedDays)
    ? [...new Set(raw.unlockedDays.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 7))]
    : [];
  const claimedDays = Array.isArray(raw.claimedDays)
    ? [...new Set(raw.claimedDays.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 7))]
    : [];

  const serverWeek = timestampLikeToDate(raw.serverWeekStartAt);
  const serverLast = timestampLikeToDate(raw.serverLastLoginDay);
  const derivedWeekKey = serverWeek
    ? `${serverWeek.getUTCFullYear()}-${pad2(serverWeek.getUTCMonth()+1)}-${pad2(serverWeek.getUTCDate())}`
    : null;
  const derivedLastKey = serverLast
    ? `${serverLast.getUTCFullYear()}-${pad2(serverLast.getUTCMonth()+1)}-${pad2(serverLast.getUTCDate())}`
    : null;

  return {
    weekKey: derivedWeekKey || (typeof raw.weekKey === 'string' && raw.weekKey ? raw.weekKey : base.weekKey),
    lastLoginDate: derivedLastKey || (typeof raw.lastLoginDate === 'string' ? raw.lastLoginDate : null),
    streak: Math.max(0, Math.min(7, Math.floor(Number(raw.streak) || 0))),
    unlockedDays,
    claimedDays,
    lastClaimedDay: Number.isInteger(Number(raw.lastClaimedDay)) ? Number(raw.lastClaimedDay) : null,
    schemaVersion: Math.max(0, Math.floor(Number(raw.schemaVersion) || 0)),
    serverWeekStartAt: raw.serverWeekStartAt || null,
    serverLastLoginDay: raw.serverLastLoginDay || null,
    serverUpdatedAt: raw.serverUpdatedAt || null
  };
}

// Registra un login de calendario. Un tier concreto sólo puede desbloquearse una vez por
// semana aunque una racha se corte y vuelva a empezar: evita farmear "día 1" adrede.
export function advanceDailyLoginState(raw, date = new Date()) {
  const todayKey = localDateKey(date);
  const currentWeekKey = weekKeyFromDate(date);
  let state = normalizeDailyRewardsState(raw, date);

  if (state.weekKey !== currentWeekKey) {
    state = defaultDailyRewardsState(date);
  }

  if (state.lastLoginDate === todayKey) {
    return { state, newCalendarLogin: false, rewardDay: null, rewardUnlocked: false, streakReset: false };
  }

  const diff = state.lastLoginDate ? calendarDayDiff(state.lastLoginDate, todayKey) : NaN;
  const consecutive = diff === 1;
  const nextStreak = state.lastLoginDate && consecutive ? Math.min(7, state.streak + 1) : 1;
  const streakReset = !!state.lastLoginDate && !consecutive;
  const rewardDay = nextStreak;
  const rewardUnlocked = !state.unlockedDays.includes(rewardDay);
  const unlockedDays = rewardUnlocked
    ? [...state.unlockedDays, rewardDay]
    : state.unlockedDays.slice();

  const next = {
    ...state,
    lastLoginDate: todayKey,
    streak: nextStreak,
    unlockedDays
  };
  return { state: next, newCalendarLogin: true, rewardDay, rewardUnlocked, streakReset };
}

export function rewardForDay(day) {
  return DAILY_REWARD_SCHEDULE.find(entry => entry.day === Number(day)) || null;
}

export function unclaimedUnlockedDays(raw, date = new Date()) {
  const state = normalizeDailyRewardsState(raw, date);
  return state.unlockedDays.filter(day => !state.claimedDays.includes(day));
}

export function isRewardClaimable(raw, day, date = new Date()) {
  const state = normalizeDailyRewardsState(raw, date);
  const n = Number(day);
  return state.unlockedDays.includes(n) && !state.claimedDays.includes(n) && !!rewardForDay(n);
}

export function applyRewardToProfileData(profile, rewardEntry) {
  if (!rewardEntry) throw new Error('INVALID_DAILY_REWARD');
  const next = { ...profile };
  const inventory = normalizeInventory(profile.inventory);
  for (const reward of rewardEntry.rewards || []) {
    const amount = Math.max(0, Math.floor(Number(reward.amount) || 0));
    if (!amount) continue;
    if (reward.type === 'points') next.points = Math.max(0, (Number(next.points) || 0) + amount);
    else if (reward.type === 'fichas') next.fichas = Math.max(0, (Number(next.fichas) || 0) + amount);
    else if (reward.type === 'standardPack') inventory[CHEST_ITEM_KEYS.standardPack] += amount;
    else if (reward.type === 'guaranteedMythic') inventory[CHEST_ITEM_KEYS.guaranteedMythic] += amount;
    else throw new Error(`UNKNOWN_DAILY_REWARD_TYPE:${reward.type}`);
  }
  next.inventory = inventory;
  return next;
}
