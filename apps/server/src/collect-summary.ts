import type { BotDropReason } from '@litemetrics/node';
import { sanitizeToken } from './log-format';

/**
 * /api/collect is the only high-volume route, and logging it per request is what
 * makes the platform log window useless: in the 15 Aug 2026 production capture, 4202
 * of the 5000 retained lines were identical `POST /api/collect` entries, leaving 7.5
 * hours of visibility on an 8-day question.
 *
 * This collapses that stream into one line per wall-clock minute, and carries the bot
 * counters alongside so the aggregate survives even after the individual drop lines
 * have aged out.
 */

export interface CollectSummaryConfig {
  /** Clock source; injected so tests do not depend on wall-clock timing. */
  now?: () => number;
  /** Where a finished minute goes. Defaults to console.log. */
  emit?: (line: string) => void;
  /** How often to check whether the open minute has ended. Default 5s. */
  checkIntervalMs?: number;
  /** Detail bot-filter lines allowed per minute before suppression. Default 20. */
  maxBotLinesPerMinute?: number;
  /** How many sites to name before collapsing the tail. Default 5. */
  topSites?: number;
  /** Upper bound on retained duration samples per minute. Default 1000. */
  maxDurationSamples?: number;
  /**
   * Upper bound on distinct site ids tracked per minute. The site id comes from the
   * request body, so without a cap one caller could mint unbounded map keys.
   * Default 200.
   */
  maxTrackedSites?: number;
  /** Detail collect-error lines allowed per minute before suppression. Default 5. */
  maxErrorLinesPerMinute?: number;
  /**
   * Upper bound on distinct error keys tracked per minute. The error class can come
   * from a driver quoting the request back, so it is no more bounded than a site id.
   * Default 50.
   */
  maxTrackedErrors?: number;
}

export interface BotHit {
  siteId: string;
  reason: BotDropReason;
  action: 'dropped' | 'flagged';
}

export interface CollectSummary {
  /**
   * Record a finished /api/collect request. `aborted` marks a request the client gave
   * up on - body never finished arriving, or hung up before the answer went out. It
   * counts toward reqs= and aborted=, not toward a status class: the status code at
   * that point is whatever the pipeline had reached, not something that was delivered.
   */
  recordRequest(statusCode: number, durationMs: number, aborted?: boolean): void;
  /**
   * Record a bot-filter hit. Returns whether the caller should also print the detail
   * line, which is capped per minute so a bot storm cannot flood the log budget.
   */
  recordBot(hit: BotHit): boolean;
  /**
   * Record a collect failure under a `<stage>:<class>` key. Returns whether the
   * caller should also print the detail line, capped per minute so a database outage
   * cannot flood the log budget with one line per failed batch.
   */
  recordError(key: string): boolean;
  /** Emit the open minute immediately (shutdown path). */
  flush(): void;
  /** Close a minute that ended while no request arrived. Exposed for tests. */
  tick(): void;
  /** Stop the internal timer. */
  stop(): void;
}

interface Bucket {
  key: string;
  reqs: number;
  ok: number;
  s3xx: number;
  s4xx: number;
  s5xx: number;
  aborted: number;
  durations: number[];
  durationsSeen: number;
  durationMax: number;
  dropped: number;
  flagged: number;
  reasons: Map<string, number>;
  sites: Map<string, number>;
  sitesOverflow: number;
  botLines: number;
  suppressed: number;
  errors: Map<string, number>;
  errorsOverflow: number;
  errorLines: number;
}

function minuteKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 16);
}

function newBucket(key: string): Bucket {
  return {
    key,
    reqs: 0,
    ok: 0,
    s3xx: 0,
    s4xx: 0,
    s5xx: 0,
    aborted: 0,
    durations: [],
    durationsSeen: 0,
    durationMax: 0,
    dropped: 0,
    flagged: 0,
    reasons: new Map(),
    sites: new Map(),
    sitesOverflow: 0,
    botLines: 0,
    suppressed: 0,
    errors: new Map(),
    errorsOverflow: 0,
    errorLines: 0,
  };
}

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function topN(
  counts: Map<string, number>,
  limit: number,
  sanitize: boolean,
  overflow = 0,
  tail: 'keys' | 'occurrences' = 'keys',
): string {
  if (counts.size === 0 && overflow === 0) return '-';
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, limit).map(([key, n]) => `${sanitize ? sanitizeToken(key) : key}:${n}`);
  const rest = sorted.length - head.length;
  if (rest > 0) {
    head.push(tail === 'occurrences'
      ? `other:${sorted.slice(head.length).reduce((total, [, n]) => total + n, 0)}`
      : `+${rest}`);
  }
  // Hits that arrived after the tracking cap. Named rather than folded into the
  // listed sites, so the line never reads as "only these sites were hit".
  if (overflow > 0) head.push(`untracked:${overflow}`);
  return head.join(',');
}

export function createCollectSummary(config: CollectSummaryConfig = {}): CollectSummary {
  const now = config.now ?? Date.now;
  const emit = config.emit ?? ((line: string) => console.log(line));
  const checkIntervalMs = config.checkIntervalMs ?? 5_000;
  const maxBotLinesPerMinute = config.maxBotLinesPerMinute ?? 20;
  const topSites = config.topSites ?? 5;
  const maxDurationSamples = config.maxDurationSamples ?? 1_000;
  const maxTrackedSites = config.maxTrackedSites ?? 200;
  const maxErrorLinesPerMinute = config.maxErrorLinesPerMinute ?? 5;
  const maxTrackedErrors = config.maxTrackedErrors ?? 50;

  let bucket: Bucket | null = null;

  function flush(): void {
    if (!bucket) return;
    const b = bucket;
    bucket = null;
    // R7: a minute with nothing in it costs no line. An error counts as something: it
    // is reported before the response completes, so a failure at the very end of a
    // minute can land in a bucket whose request lands in the next one.
    if (b.reqs === 0 && b.dropped === 0 && b.flagged === 0 && b.errors.size === 0 && b.errorsOverflow === 0) return;

    const sorted = [...b.durations].sort((x, y) => x - y);
    const p50 = sorted.length ? String(Math.round(percentile(sorted, 50))) : '-';
    const p95 = sorted.length ? String(Math.round(percentile(sorted, 95))) : '-';
    const max = sorted.length ? String(Math.round(b.durationMax)) : '-';

    emit(
      [
        '[collect]',
        `minute=${b.key}`,
        `reqs=${b.reqs}`,
        `ok=${b.ok}`,
        `3xx=${b.s3xx}`,
        `4xx=${b.s4xx}`,
        `5xx=${b.s5xx}`,
        // Requests the client gave up on: body never completed, or hung up before the
        // answer. A lost batch is the one thing this line exists to make countable, so
        // it is its own outcome class - reqs = ok + 3xx + 4xx + 5xx + aborted - rather
        // than hiding inside whichever status class the pipeline had reached.
        `aborted=${b.aborted}`,
        `dur_p50=${p50}`,
        `dur_p95=${p95}`,
        `dur_max=${max}`,
        `bot_dropped=${b.dropped}`,
        `bot_flagged=${b.flagged}`,
        `reasons=${topN(b.reasons, b.reasons.size, false)}`,
        // Named bot_sites, not sites: this map is fed only by recordBot, so it counts
        // bot hits per site - not request volume, which sits in reqs.
        `bot_sites=${topN(b.sites, topSites, true, b.sitesOverflow)}`,
        `suppressed=${b.suppressed}`,
        // Appended last on purpose: monitoring parses the fields above, so a new one
        // goes on the end where it cannot move them.
        `err_codes=${topN(b.errors, 10, true, b.errorsOverflow, 'occurrences')}`,
      ].join(' '),
    );
  }

  function current(): Bucket {
    const key = minuteKey(now());
    if (bucket && bucket.key !== key) flush();
    if (!bucket) bucket = newBucket(key);
    return bucket;
  }

  function addDuration(b: Bucket, ms: number): void {
    if (ms > b.durationMax || b.durationsSeen === 0) b.durationMax = ms;
    b.durationsSeen++;
    if (b.durations.length < maxDurationSamples) {
      b.durations.push(ms);
      return;
    }
    // Reservoir sampling: keeps the percentile estimate unbiased under a burst
    // instead of pinning it to whatever arrived in the first part of the minute.
    const index = Math.floor(Math.random() * b.durationsSeen);
    if (index < maxDurationSamples) b.durations[index] = ms;
  }

  const timer = setInterval(() => {
    if (bucket && bucket.key !== minuteKey(now())) flush();
  }, checkIntervalMs);
  timer.unref?.();

  return {
    recordRequest(statusCode: number, durationMs: number, aborted = false): void {
      const b = current();
      b.reqs++;
      if (aborted) b.aborted++;
      else if (statusCode >= 500) b.s5xx++;
      else if (statusCode >= 400) b.s4xx++;
      else if (statusCode >= 300) b.s3xx++;
      else b.ok++;
      addDuration(b, durationMs);
    },

    recordBot(hit: BotHit): boolean {
      const b = current();
      if (hit.action === 'dropped') b.dropped++;
      else b.flagged++;
      b.reasons.set(hit.reason, (b.reasons.get(hit.reason) ?? 0) + 1);
      // Only grow the site map up to the cap; hits for sites past it still land in
      // the dropped/flagged totals, they just do not each get their own key.
      if (b.sites.has(hit.siteId) || b.sites.size < maxTrackedSites) {
        b.sites.set(hit.siteId, (b.sites.get(hit.siteId) ?? 0) + 1);
      } else {
        b.sitesOverflow++;
      }

      if (b.botLines < maxBotLinesPerMinute) {
        b.botLines++;
        return true;
      }
      b.suppressed++;
      return false;
    },

    recordError(key: string): boolean {
      const b = current();
      // Same cap shape as the site map: keys past the cap still show up, as an
      // untracked count, rather than each minting a map entry.
      if (b.errors.has(key) || b.errors.size < maxTrackedErrors) {
        b.errors.set(key, (b.errors.get(key) ?? 0) + 1);
      } else {
        b.errorsOverflow++;
      }

      if (b.errorLines < maxErrorLinesPerMinute) {
        b.errorLines++;
        return true;
      }
      return false;
    },

    flush,

    tick(): void {
      if (bucket && bucket.key !== minuteKey(now())) flush();
    },

    stop(): void {
      clearInterval(timer);
    },
  };
}
