export interface RateLimiterConfig {
  /** Sliding window size in ms. */
  windowMs: number;
  /** Max events per window per IP. */
  maxEvents: number;
  /** Hard cap on tracked IPs (LRU-evicts oldest). Default: 10_000. */
  maxIps?: number;
}

export interface RateLimitResult {
  limited: boolean;
  count: number;
}

interface IpEntry {
  timestamps: number[];
}

export interface RateLimiter {
  check(ip: string): RateLimitResult;
  size(): number;
  reset(): void;
}

export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  const { windowMs, maxEvents, maxIps = 10_000 } = config;
  // JS Map preserves insertion order; re-inserting on access moves the key
  // to the end, so the first key returned by .keys() is the least-recently-used.
  // This makes eviction O(1) under sustained unique-IP attacks.
  const map = new Map<string, IpEntry>();

  function evictOldest(): void {
    const oldest = map.keys().next();
    if (!oldest.done) map.delete(oldest.value);
  }

  return {
    check(ip: string): RateLimitResult {
      if (!ip) return { limited: false, count: 0 };

      const now = Date.now();
      const cutoff = now - windowMs;

      let entry = map.get(ip);
      if (entry) {
        // Touch for LRU: move to end of insertion order.
        map.delete(ip);
        map.set(ip, entry);
      } else {
        if (map.size >= maxIps) evictOldest();
        entry = { timestamps: [] };
        map.set(ip, entry);
      }

      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      const currentCount = entry.timestamps.length;
      if (currentCount >= maxEvents) {
        // Already at/over the limit. Don't grow the array under sustained attack;
        // the count we report is the post-push count for caller compatibility.
        return { limited: true, count: currentCount + 1 };
      }

      entry.timestamps.push(now);
      return { limited: false, count: entry.timestamps.length };
    },
    size(): number {
      return map.size;
    },
    reset(): void {
      map.clear();
    },
  };
}
