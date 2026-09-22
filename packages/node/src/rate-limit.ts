export interface RateLimiterConfig {
  /** Sliding window size in ms. */
  windowMs: number;
  /**
   * Max calls to `check(key)` per window per key. The caller decides what one call
   * means and what the key is: the bot filter's layer 3 keys by IP and calls it once
   * per collect request, so a batch of 100 events spends a single slot, while layer 4
   * keys by `siteId:visitorId` and calls it once per pageview in the batch.
   */
  maxEvents: number;
  /**
   * Also record calls that come back limited, keeping only the newest `maxEvents`
   * timestamps. Off by default, which is layer 3's behaviour: a limited call leaves no
   * trace, so a key refills as its admitted timestamps expire and a sustained flood gets
   * `maxEvents` calls through per window, indefinitely. On, `limited` means "the last
   * `maxEvents` calls all landed inside the window", i.e. the CURRENT rate is over the
   * line: a sustained flood stays limited for as long as it runs, and the key clears one
   * window after the rate drops. Memory is unchanged - the array never exceeds `maxEvents`.
   */
  countLimited?: boolean;
  /** Hard cap on tracked keys (LRU-evicts oldest). Default: 10_000. */
  maxKeys?: number;
  /** @deprecated Older name for {@link maxKeys}, kept working for existing callers. */
  maxIps?: number;
}

export interface RateLimitResult {
  limited: boolean;
  count: number;
}

interface KeyEntry {
  timestamps: number[];
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
  size(): number;
  reset(): void;
}

export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  const { windowMs, maxEvents } = config;
  const maxKeys = config.maxKeys ?? config.maxIps ?? 10_000;
  // JS Map preserves insertion order; re-inserting on access moves the key
  // to the end, so the first key returned by .keys() is the least-recently-used.
  // This makes eviction O(1) under sustained unique-key attacks.
  const map = new Map<string, KeyEntry>();

  function evictOldest(): void {
    const oldest = map.keys().next();
    if (!oldest.done) map.delete(oldest.value);
  }

  return {
    check(key: string): RateLimitResult {
      if (!key) return { limited: false, count: 0 };

      const now = Date.now();
      const cutoff = now - windowMs;

      let entry = map.get(key);
      if (entry) {
        // Touch for LRU: move to end of insertion order.
        map.delete(key);
        map.set(key, entry);
      } else {
        if (map.size >= maxKeys) evictOldest();
        entry = { timestamps: [] };
        map.set(key, entry);
      }

      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      const currentCount = entry.timestamps.length;
      if (currentCount >= maxEvents) {
        // Already at/over the limit. Don't grow the array under sustained attack;
        // the count we report is the post-push count for caller compatibility.
        if (config.countLimited) {
          // Keep the window at exactly maxEvents entries: newest in, oldest out.
          entry.timestamps.push(now);
          entry.timestamps.shift();
        }
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
