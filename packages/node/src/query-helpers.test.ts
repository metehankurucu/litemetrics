import { describe, it, expect, vi } from 'vitest';
import { isValidTimezone, extractQueryParams, aggregateBotStats } from './query-helpers';

describe('isValidTimezone', () => {
  it.each([
    'UTC',
    'America/New_York',
    'Europe/Istanbul',
    'Asia/Kolkata',
    'Pacific/Honolulu',
    'Australia/Sydney',
  ])('returns true for valid timezone: %s', (tz) => {
    expect(isValidTimezone(tz)).toBe(true);
  });

  it.each([
    '',
    'Invalid/Timezone',
    'foobar',
    'Not/A/Zone',
    'CEST',
  ])('returns false for invalid timezone: %s', (tz) => {
    expect(isValidTimezone(tz)).toBe(false);
  });
});

describe('extractQueryParams', () => {
  function makeReq(query: Record<string, string>) {
    return { query };
  }

  it('extracts basic params', () => {
    const params = extractQueryParams(makeReq({
      siteId: 'site_abc',
      metric: 'pageviews',
      period: '7d',
    }));
    expect(params.siteId).toBe('site_abc');
    expect(params.metric).toBe('pageviews');
    expect(params.period).toBe('7d');
    expect(params.compare).toBe(false);
  });

  it('preserves valid timezone', () => {
    const params = extractQueryParams(makeReq({
      siteId: 's',
      metric: 'pageviews',
      timezone: 'America/New_York',
    }));
    expect(params.timezone).toBe('America/New_York');
  });

  it('drops invalid timezone to undefined', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const params = extractQueryParams(makeReq({
      siteId: 's',
      metric: 'pageviews',
      timezone: 'Not/Real',
    }));
    expect(params.timezone).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it('parses compare=true as boolean', () => {
    const params = extractQueryParams(makeReq({
      siteId: 's',
      metric: 'pageviews',
      compare: 'true',
    }));
    expect(params.compare).toBe(true);
  });

  it('parses compare=1 as boolean', () => {
    const params = extractQueryParams(makeReq({
      siteId: 's',
      metric: 'pageviews',
      compare: '1',
    }));
    expect(params.compare).toBe(true);
  });

  it('parses limit as integer', () => {
    const params = extractQueryParams(makeReq({
      siteId: 's',
      metric: 'top_pages',
      limit: '20',
    }));
    expect(params.limit).toBe(20);
  });

  it('parses filters from JSON string', () => {
    const params = extractQueryParams(makeReq({
      siteId: 's',
      metric: 'pageviews',
      filters: '{"country":"US"}',
    }));
    expect(params.filters).toEqual({ country: 'US' });
  });

  it('falls back to URL searchParams when req.query is absent', () => {
    const req = { url: '/api/stats?siteId=s&metric=visitors&timezone=UTC' };
    const params = extractQueryParams(req);
    expect(params.siteId).toBe('s');
    expect(params.metric).toBe('visitors');
    expect(params.timezone).toBe('UTC');
  });
});

// The bucket list is load-bearing, not cosmetic: `total` is summed from the buckets, so a
// bot_flag value the aggregator does not know about is counted nowhere. The row is stored,
// hidden from the default query by `bot_flag IS NOT NULL`, and then absent from the one
// report that exists to show what was hidden.
describe('aggregateBotStats', () => {
  it('counts every layer, including velocity, into its own bucket and the total', () => {
    expect(
      aggregateBotStats([
        { bot_flag: 'signature', n: 4 },
        { bot_flag: 'heuristic', n: 3 },
        { bot_flag: 'rate-limit', n: 2 },
        { bot_flag: 'velocity', n: 5031 },
      ]),
    ).toEqual({
      total: 5040,
      bySignature: 4,
      byHeuristic: 3,
      byRateLimit: 2,
      byVelocity: 5031,
    });
  });

  it('reports zeroes for a site with no flagged rows', () => {
    expect(aggregateBotStats([])).toEqual({
      total: 0, bySignature: 0, byHeuristic: 0, byRateLimit: 0, byVelocity: 0,
    });
  });

  it('accepts the string counts Postgres returns for ::bigint', () => {
    const stats = aggregateBotStats([{ bot_flag: 'velocity', n: '5031' }]);
    expect(stats.byVelocity).toBe(5031);
    expect(stats.total).toBe(5031);
  });

  it('ignores null, unknown and unparseable rows instead of poisoning the total', () => {
    expect(
      aggregateBotStats([
        { bot_flag: null, n: 900 },
        { bot_flag: 'something-new', n: 7 },
        { bot_flag: 'velocity', n: 'not-a-number' },
        { bot_flag: 'velocity', n: 2 },
      ]),
    ).toEqual({
      total: 2, bySignature: 0, byHeuristic: 0, byRateLimit: 0, byVelocity: 2,
    });
  });
});
