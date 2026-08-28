// js/gameRng.js — Argentinia 23.18 Stability & Replay Foundation
// RNG determinista de gameplay. Economía/IDs/red pueden seguir usando crypto/Math.random:
// esta fuente existe exclusivamente para decisiones que afectan una partida y su replay.

export const GAME_RNG_VERSION = 'mulberry32-v1';

function fnv1a32(text) {
  let h = 0x811c9dc5;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function normalizeGameSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return (seed >>> 0) || 0x6d2b79f5;
  if (typeof seed === 'bigint') return Number(seed & 0xffffffffn) >>> 0 || 0x6d2b79f5;
  const raw = String(seed ?? '').trim();
  if (!raw) return 0x6d2b79f5;
  if (/^0x[0-9a-f]+$/i.test(raw)) return (parseInt(raw, 16) >>> 0) || 0x6d2b79f5;
  if (/^\d+$/.test(raw)) return (Number(raw) >>> 0) || 0x6d2b79f5;
  return fnv1a32(raw) || 0x6d2b79f5;
}

function entropySeed() {
  try {
    const c = globalThis.crypto;
    if (c?.getRandomValues) {
      const a = new Uint32Array(1);
      c.getRandomValues(a);
      if (a[0]) return a[0] >>> 0;
    }
  } catch {}
  return normalizeGameSeed(`${Date.now()}|${Math.random()}|${typeof performance !== 'undefined' ? performance.now() : 0}`);
}

function nextMulberry32(state) {
  const nextState = (state + 0x6D2B79F5) >>> 0;
  let t = nextState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { state: nextState, value };
}

let runtime = {
  active: false,
  seed: 0,
  state: 0,
  draws: 0,
  label: null,
  tagCounts: Object.create(null)
};

let observer = null;

export function setGameRngObserver(fn) {
  observer = typeof fn === 'function' ? fn : null;
}

export function gameSeedFromLocation(param = 'argSeed') {
  try {
    const search = globalThis.location?.search;
    if (!search) return null;
    const value = new URLSearchParams(search).get(param);
    return value == null || value === '' ? null : value;
  } catch {
    return null;
  }
}

export function beginGameRngSession(options = {}) {
  const seed = normalizeGameSeed(options.seed ?? entropySeed());
  runtime = {
    active: true,
    seed,
    state: seed,
    draws: 0,
    label: options.label ? String(options.label) : null,
    tagCounts: Object.create(null)
  };
  return getGameRngSnapshot();
}

export function restoreGameRngSession(snapshot) {
  if (!snapshot || snapshot.version !== GAME_RNG_VERSION) return false;
  const seed = normalizeGameSeed(snapshot.seed);
  runtime = {
    active: snapshot.active !== false,
    seed,
    state: normalizeGameSeed(snapshot.state ?? seed),
    draws: Math.max(0, Math.floor(Number(snapshot.draws) || 0)),
    label: snapshot.label ? String(snapshot.label) : null,
    tagCounts: { ...(snapshot.tagCounts || {}) }
  };
  return true;
}

export function endGameRngSession() {
  runtime.active = false;
}

export function gameRandom(tag = 'gameplay') {
  if (!runtime.active) return Math.random();
  const next = nextMulberry32(runtime.state);
  runtime.state = next.state;
  runtime.draws += 1;
  const key = String(tag || 'gameplay');
  runtime.tagCounts[key] = (runtime.tagCounts[key] || 0) + 1;
  try { observer?.({ draw: runtime.draws, tag: key, value: next.value, state: runtime.state }); } catch {}
  return next.value;
}

export function gameRandomInt(maxExclusive, tag = 'gameplay') {
  const max = Math.max(0, Math.floor(Number(maxExclusive) || 0));
  if (max <= 0) return 0;
  return Math.floor(gameRandom(tag) * max);
}

export function getGameRngSnapshot() {
  return {
    version: GAME_RNG_VERSION,
    active: !!runtime.active,
    seed: runtime.seed >>> 0,
    seedHex: `0x${(runtime.seed >>> 0).toString(16).padStart(8, '0')}`,
    state: runtime.state >>> 0,
    draws: runtime.draws,
    label: runtime.label,
    tagCounts: { ...runtime.tagCounts }
  };
}

export function createSeededRng(seed) {
  const initialSeed = normalizeGameSeed(seed);
  let state = initialSeed;
  let draws = 0;
  const rng = () => {
    const next = nextMulberry32(state);
    state = next.state;
    draws += 1;
    return next.value;
  };
  rng.snapshot = () => ({ version: GAME_RNG_VERSION, seed: initialSeed, state, draws });
  return rng;
}

export const __gameRngTest = { fnv1a32, nextMulberry32, entropySeed };
