import { describe, it, expect, vi } from 'vitest';
import { isValidTimezone, extractQueryParams } from './query-helpers';

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
