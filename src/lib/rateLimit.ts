type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS_BEFORE_PRUNE = 5000;
const MAX_BUCKETS_HARD_CAP = 10000;

function pruneExpiredBuckets(now: number) {
  for (const [k, b] of buckets.entries()) {
    if (now >= b.resetAt) {
      buckets.delete(k);
    }
  }
  // Hard cap: if still too large, drop oldest entries
  if (buckets.size > MAX_BUCKETS_HARD_CAP) {
    const excess = buckets.size - MAX_BUCKETS_HARD_CAP;
    let dropped = 0;
    for (const k of buckets.keys()) {
      buckets.delete(k);
      dropped++;
      if (dropped >= excess) break;
    }
  }
}

export function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS_BEFORE_PRUNE) {
    pruneExpiredBuckets(now);
  }

  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfter: 0 };
}

export function resetRateLimitsForTesting(): void {
  buckets.clear();
}

