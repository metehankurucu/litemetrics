import type { QueryParams, BotStats } from '@litemetrics/core';
import { validateDateRange } from './query-validation';

/** Kept as the name existing importers use; the shape now lives in `@litemetrics/core`. */
export type BotStatsResult = BotStats;

/**
 * Aggregate raw `(bot_flag, n)` rows into the dashboard-shaped bot stats result.
 * Adapters call this after running a `GROUP BY bot_flag` query.
 *
 * `total` is summed from the buckets, not counted from the rows, so every bot_flag the
 * collector can write needs a bucket here. A value with no bucket is stored, hidden from
 * the default query by `bot_flag IS NULL`, and then missing from the one report that
 * exists to say what was hidden.
 */
export function aggregateBotStats(
  rows: Array<{ bot_flag: string | null | undefined; n: string | number }>,
): BotStatsResult {
  let bySignature = 0;
  let byHeuristic = 0;
  let byRateLimit = 0;
  let byVelocity = 0;
  for (const r of rows) {
    const n = Number(r.n);
    if (!Number.isFinite(n)) continue;
    if (r.bot_flag === 'signature') bySignature += n;
    else if (r.bot_flag === 'heuristic') byHeuristic += n;
    else if (r.bot_flag === 'rate-limit') byRateLimit += n;
    else if (r.bot_flag === 'velocity') byVelocity += n;
  }
  return {
    total: bySignature + byHeuristic + byRateLimit + byVelocity,
    bySignature,
    byHeuristic,
    byRateLimit,
    byVelocity,
  };
}

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function extractQueryParams(req: any): QueryParams {
  const q = req.query ?? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
  let timezone: string | undefined;
  if (typeof q.timezone === 'string' && q.timezone) {
    if (isValidTimezone(q.timezone)) {
      timezone = q.timezone;
    } else {
      console.warn(`[litemetrics] Invalid timezone "${q.timezone}", falling back to UTC`);
    }
  }
  // Throws QueryValidationError (400) rather than letting an unparseable date reach the
  // adapter and come back as a 500.
  const { dateFrom, dateTo } = validateDateRange({
    period: q.period,
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
  });
  return {
    siteId: q.siteId as string,
    metric: q.metric as QueryParams['metric'],
    period: q.period as QueryParams['period'],
    dateFrom,
    dateTo,
    limit: q.limit ? parseInt(q.limit as string, 10) : undefined,
    filters: q.filters ? JSON.parse(q.filters as string) : undefined,
    compare: q.compare === 'true' || q.compare === '1',
    timezone,
    includeBots: q.includeBots === 'true' || q.includeBots === '1',
  };
}
