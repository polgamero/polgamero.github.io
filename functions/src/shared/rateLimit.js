import { economyError } from './errors.js';

// Foundation guard: in-memory, zero-Firestore-cost throttle. It is intentionally
// conservative while maxInstances=1. This is a cost-safety brake, not an anti-abuse
// substitute for App Check or product-specific limits in later migration waves.
const buckets = new Map();
const MAX_BUCKETS = 10000;

function prune(now) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, entry] of buckets) {
    if (!entry || entry.resetAt <= now) buckets.delete(key);
    if (buckets.size < Math.floor(MAX_BUCKETS * 0.9)) break;
  }
  // Fail closed on pathological cardinality rather than growing memory without bound.
  if (buckets.size >= MAX_BUCKETS) buckets.clear();
}

export function assertRateLimit(uid, bucketName, { limit = 30, windowMs = 60000 } = {}) {
  const safeUid = String(uid || '').trim();
  const safeBucket = String(bucketName || '').trim();
  if (!safeUid || !safeBucket) throw economyError('INVALID_ECONOMY_REQUEST');
  const now = Date.now();
  prune(now);
  const key = `${safeUid}:${safeBucket}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { remaining: Math.max(0, limit - 1), resetAt: now + windowMs };
  }
  if (current.count >= limit) {
    throw economyError('RATE_LIMITED', { retryAfterMs: Math.max(1, current.resetAt - now), bucket: safeBucket });
  }
  current.count += 1;
  return { remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

export function __resetRateLimitsForTest() {
  buckets.clear();
}
