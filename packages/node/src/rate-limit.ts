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
  lastSeen: number;
}

export interface RateLimiter {
  check(ip: string): RateLimitResult;
  size(): number;
  reset(): void;
}

export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  const { windowMs, maxEvents, maxIps = 10_000 } = config;
  const map = new Map<string, IpEntry>();

  function evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestSeen = Infinity;
    for (const [k, v] of map) {
      if (v.lastSeen < oldestSeen) {
        oldestSeen = v.lastSeen;
        oldestKey = k;
      }
    }
    if (oldestKey) map.delete(oldestKey);
  }

  return {
    check(ip: string): RateLimitResult {
      if (!ip) return { limited: false, count: 0 };

      const now = Date.now();
      const cutoff = now - windowMs;

      let entry = map.get(ip);
      if (!entry) {
        if (map.size >= maxIps) evictOldest();
        entry = { timestamps: [], lastSeen: now };
        map.set(ip, entry);
      }

      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      entry.timestamps.push(now);
      entry.lastSeen = now;

      const count = entry.timestamps.length;
      return { limited: count > maxEvents, count };
    },
    size(): number {
      return map.size;
    },
    reset(): void {
      map.clear();
    },
  };
}
