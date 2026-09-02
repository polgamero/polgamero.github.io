import crypto from 'node:crypto';

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const normalized = normalize(value[key]);
      if (normalized !== undefined) out[key] = normalized;
    }
    return out;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (value === undefined) return undefined;
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}

export function requestDigest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function hashToSeed(text) {
  const digest = crypto.createHash('sha256').update(String(text)).digest();
  return digest.readUInt32BE(0) || 0x6d2b79f5;
}

export function seededRng(seedInput) {
  let state = hashToSeed(seedInput) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
