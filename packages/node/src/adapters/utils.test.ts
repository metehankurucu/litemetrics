import { describe, it, expect } from 'vitest';
import {
  toUTCDate,
  getTimezoneOffsetMs,
  resolvePeriod,
  previousPeriodRange,
  autoGranularity,
  granularityToDateFormat,
  formatDateBucket,
  getISOWeek,
  fillBuckets,
  generateSiteId,
  generateSecretKey,
  capLimit,
  countBuckets,
  assertTimeseriesBudget,
  QueryValidationError,
  MAX_TIMESERIES_BUCKETS,
} from './utils';

// ─── toUTCDate ───────────────────────────────────────

describe('toUTCDate', () => {
  it('returns the same Date instance when given a Date', () => {
    const d = new Date('2024-01-15T12:00:00Z');
    expect(toUTCDate(d)).toBe(d);
  });

  it('creates Date from numeric timestamp', () => {
    const ts = 1705320000000;
    expect(toUTCDate(ts).getTime()).toBe(ts);
  });

  it('treats bare space-separated datetime as UTC', () => {
    const result = toUTCDate('2024-01-15 12:00:00');
    expect(result.toISOString()).toBe('2024-01-15T12:00:00.000Z');
  });

  it('treats bare ISO datetime (no Z) as UTC', () => {
    const result = toUTCDate('2024-01-15T12:00:00');
    expect(result.toISOString()).toBe('2024-01-15T12:00:00.000Z');
  });

  it('preserves Z-suffixed strings', () => {
    const result = toUTCDate('2024-01-15T12:00:00Z');
    expect(result.toISOString()).toBe('2024-01-15T12:00:00.000Z');
  });

  it('respects positive timezone offset', () => {
    const result = toUTCDate('2024-01-15T17:30:00+05:30');
    expect(result.toISOString()).toBe('2024-01-15T12:00:00.000Z');
  });

  it('respects negative timezone offset', () => {
    const result = toUTCDate('2024-01-15T07:00:00-05:00');
    expect(result.toISOString()).toBe('2024-01-15T12:00:00.000Z');
  });

  it('trims whitespace', () => {
    const result = toUTCDate('  2024-01-15T12:00:00  ');
    expect(result.toISOString()).toBe('2024-01-15T12:00:00.000Z');
  });

  it('handles ClickHouse-style datetime with milliseconds', () => {
    const result = toUTCDate('2024-01-15 12:00:00.123');
    expect(result.getUTCHours()).toBe(12);
    expect(result.getUTCMilliseconds()).toBe(123);
  });

  it('does not append Z to colon-less offset format (+0530)', () => {
    const result = toUTCDate('2024-01-15T17:30:00+0530');
    // +0530 = +05:30, so 17:30 +0530 = 12:00 UTC
    expect(result.getTime()).not.toBeNaN();
  });

  it('does not append Z to colon-less negative offset (-0500)', () => {
    const result = toUTCDate('2024-01-15T07:00:00-0500');
    expect(result.getTime()).not.toBeNaN();
  });
});

// ─── getTimezoneOffsetMs ──────────────────────────────

describe('getTimezoneOffsetMs', () => {
  it('returns 0 for UTC', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    expect(getTimezoneOffsetMs(date, 'UTC')).toBe(0);
  });

  it('returns +3h for Europe/Istanbul (no DST)', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    expect(getTimezoneOffsetMs(date, 'Europe/Istanbul')).toBe(3 * 3600000);
  });

  it('returns -5h for America/New_York in January (EST)', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    expect(getTimezoneOffsetMs(date, 'America/New_York')).toBe(-5 * 3600000);
  });

  it('returns -4h for America/New_York in July (EDT)', () => {
    const date = new Date('2024-07-15T12:00:00Z');
    expect(getTimezoneOffsetMs(date, 'America/New_York')).toBe(-4 * 3600000);
  });

  it('handles half-hour offset: Asia/Kolkata (+5:30)', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    expect(getTimezoneOffsetMs(date, 'Asia/Kolkata')).toBe(5.5 * 3600000);
  });

  it('handles 45-min offset: Asia/Kathmandu (+5:45)', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    expect(getTimezoneOffsetMs(date, 'Asia/Kathmandu')).toBe(5.75 * 3600000);
  });

  it('detects DST spring-forward boundary', () => {
    // 2024 US spring-forward: March 10 at 2am ET (7am UTC)
    const beforeDST = new Date('2024-03-10T06:59:00Z'); // 1:59am EST
    const afterDST = new Date('2024-03-10T07:01:00Z');  // 3:01am EDT
    expect(getTimezoneOffsetMs(beforeDST, 'America/New_York')).toBe(-5 * 3600000);
    expect(getTimezoneOffsetMs(afterDST, 'America/New_York')).toBe(-4 * 3600000);
  });

  it('handles large negative offset: Pacific/Honolulu (-10)', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    expect(getTimezoneOffsetMs(date, 'Pacific/Honolulu')).toBe(-10 * 3600000);
  });
});

// ─── resolvePeriod ───────────────────────────────────

describe('resolvePeriod', () => {
  it('defaults to 7d when no period specified', () => {
    const { period, dateRange } = resolvePeriod({});
    expect(period).toBe('7d');
    const duration = new Date(dateRange.to).getTime() - new Date(dateRange.from).getTime();
    expect(duration).toBeCloseTo(7 * 24 * 3600000, -3); // within ~1s
  });

  it('resolves 1h', () => {
    const { period, dateRange } = resolvePeriod({ period: '1h' });
    expect(period).toBe('1h');
    const duration = new Date(dateRange.to).getTime() - new Date(dateRange.from).getTime();
    expect(duration).toBeCloseTo(3600000, -3);
  });

  it('resolves 24h', () => {
    const { dateRange } = resolvePeriod({ period: '24h' });
    const duration = new Date(dateRange.to).getTime() - new Date(dateRange.from).getTime();
    expect(duration).toBeCloseTo(24 * 3600000, -3);
  });

  it('resolves 30d', () => {
    const { dateRange } = resolvePeriod({ period: '30d' });
    const duration = new Date(dateRange.to).getTime() - new Date(dateRange.from).getTime();
    expect(duration).toBeCloseTo(30 * 24 * 3600000, -3);
  });

  it('resolves 90d', () => {
    const { dateRange } = resolvePeriod({ period: '90d' });
    const duration = new Date(dateRange.to).getTime() - new Date(dateRange.from).getTime();
    expect(duration).toBeCloseTo(90 * 24 * 3600000, -3);
  });

  it('uses custom dateFrom/dateTo passthrough', () => {
    const { period, dateRange } = resolvePeriod({
      period: 'custom',
      dateFrom: '2024-01-01T00:00:00Z',
      dateTo: '2024-01-31T23:59:59Z',
    });
    expect(period).toBe('custom');
    expect(dateRange.from).toBe('2024-01-01T00:00:00Z');
    expect(dateRange.to).toBe('2024-01-31T23:59:59Z');
  });

  it('falls back to 7d for unknown period', () => {
    const { dateRange } = resolvePeriod({ period: 'unknown' as any });
    const duration = new Date(dateRange.to).getTime() - new Date(dateRange.from).getTime();
    expect(duration).toBeCloseTo(7 * 24 * 3600000, -3);
  });
});

// ─── previousPeriodRange ──────────────────────────────

describe('previousPeriodRange', () => {
  it('computes previous range with same duration', () => {
    const current = {
      from: '2024-01-08T00:00:00.000Z',
      to: '2024-01-15T00:00:00.000Z',
    };
    const prev = previousPeriodRange(current);
    const currentDuration = new Date(current.to).getTime() - new Date(current.from).getTime();
    const prevDuration = new Date(prev.to).getTime() - new Date(prev.from).getTime();
    expect(prevDuration).toBe(currentDuration);
  });

  it('previous range ends 1ms before current range starts', () => {
    const current = {
      from: '2024-01-08T00:00:00.000Z',
      to: '2024-01-15T00:00:00.000Z',
    };
    const prev = previousPeriodRange(current);
    expect(new Date(prev.to).getTime()).toBe(new Date(current.from).getTime() - 1);
  });

  it('works with short 1-hour ranges', () => {
    const current = {
      from: '2024-01-15T12:00:00.000Z',
      to: '2024-01-15T13:00:00.000Z',
    };
    const prev = previousPeriodRange(current);
    const prevDuration = new Date(prev.to).getTime() - new Date(prev.from).getTime();
    expect(prevDuration).toBe(3600000);
  });
});

// ─── autoGranularity ─────────────────────────────────

describe('autoGranularity', () => {
  it.each([
    ['1h', 'hour'],
    ['24h', 'hour'],
    ['7d', 'day'],
    ['30d', 'day'],
    ['90d', 'week'],
    ['custom', 'day'],
  ] as const)('maps %s → %s', (period, expected) => {
    expect(autoGranularity(period)).toBe(expected);
  });
});

// ─── granularityToDateFormat ─────────────────────────

describe('granularityToDateFormat', () => {
  it.each([
    ['hour', '%Y-%m-%dT%H:00'],
    ['day', '%Y-%m-%d'],
    ['week', '%G-W%V'],
    ['month', '%Y-%m'],
  ] as const)('maps %s → %s', (granularity, expected) => {
    expect(granularityToDateFormat(granularity)).toBe(expected);
  });
});

// ─── formatDateBucket ────────────────────────────────

describe('formatDateBucket', () => {
  it('formats hour bucket', () => {
    const date = new Date('2024-01-15T14:30:00Z');
    expect(formatDateBucket(date, '%Y-%m-%dT%H:00')).toBe('2024-01-15T14:00');
  });

  it('formats day bucket', () => {
    const date = new Date('2024-01-15T14:30:00Z');
    expect(formatDateBucket(date, '%Y-%m-%d')).toBe('2024-01-15');
  });

  it('formats month bucket', () => {
    const date = new Date('2024-01-15T14:30:00Z');
    expect(formatDateBucket(date, '%Y-%m')).toBe('2024-01');
  });

  it('formats week bucket as ISO week', () => {
    // 2024-01-15 is a Monday in week 3
    const date = new Date('2024-01-15T14:30:00Z');
    expect(formatDateBucket(date, '%G-W%V')).toBe('2024-W03');
  });

  it('pads single-digit months/days/hours', () => {
    const date = new Date('2024-03-05T03:00:00Z');
    expect(formatDateBucket(date, '%Y-%m-%dT%H:00')).toBe('2024-03-05T03:00');
  });

  it('falls back to ISO string for unknown format', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    expect(formatDateBucket(date, '%unknown')).toBe(date.toISOString());
  });
});

// ─── getISOWeek ──────────────────────────────────────

describe('getISOWeek', () => {
  it('returns correct week for mid-January 2024', () => {
    const date = new Date('2024-01-15T00:00:00Z');
    expect(getISOWeek(date)).toBe('2024-W03');
  });

  it('returns correct week for Jan 1 2024', () => {
    const date = new Date('2024-01-01T00:00:00Z');
    expect(getISOWeek(date)).toBe('2024-W01');
  });

  it('returns correct week for Dec 31 2024', () => {
    const date = new Date('2024-12-31T00:00:00Z');
    const week = getISOWeek(date);
    expect(week).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('is consistent with formatDateBucket week format', () => {
    const date = new Date('2024-06-12T00:00:00Z');
    expect(getISOWeek(date)).toBe(formatDateBucket(date, '%G-W%V'));
  });
});

// ─── fillBuckets ─────────────────────────────────────

describe('fillBuckets', () => {
  it('fills missing hourly buckets with 0', () => {
    const from = new Date('2024-01-15T10:00:00Z');
    const to = new Date('2024-01-15T13:00:00Z');
    const rows = [{ _id: '2024-01-15T11:00', value: 5 }];

    const points = fillBuckets(from, to, 'hour', '%Y-%m-%dT%H:00', rows);

    expect(points).toHaveLength(4);
    expect(points.map((p) => p.value)).toEqual([0, 5, 0, 0]);
  });

  it('fills missing daily buckets with 0', () => {
    const from = new Date('2024-01-13T00:00:00Z');
    const to = new Date('2024-01-15T23:59:00Z');
    const rows = [{ _id: '2024-01-14', value: 10 }];

    const points = fillBuckets(from, to, 'day', '%Y-%m-%d', rows);

    expect(points).toHaveLength(3);
    expect(points.map((p) => p.value)).toEqual([0, 10, 0]);
  });

  it('returns all-zero points for empty rows', () => {
    const from = new Date('2024-01-15T00:00:00Z');
    const to = new Date('2024-01-17T23:59:00Z');
    const points = fillBuckets(from, to, 'day', '%Y-%m-%d', []);

    expect(points.length).toBeGreaterThanOrEqual(3);
    expect(points.every((p) => p.value === 0)).toBe(true);
  });

  it('aligns weekly buckets to Monday', () => {
    // 2024-01-15 is already a Monday
    const from = new Date('2024-01-15T00:00:00Z');
    const to = new Date('2024-01-28T23:59:00Z');
    const points = fillBuckets(from, to, 'week', '%G-W%V', []);

    expect(points).toHaveLength(2);
  });

  it('aligns monthly buckets to 1st of month', () => {
    const from = new Date('2024-01-15T00:00:00Z');
    const to = new Date('2024-03-15T23:59:00Z');
    const points = fillBuckets(from, to, 'month', '%Y-%m', []);

    expect(points).toHaveLength(3); // Jan, Feb, Mar
  });

  it('produces valid UTC ISO date strings in output', () => {
    const from = new Date('2024-01-15T00:00:00Z');
    const to = new Date('2024-01-17T23:59:00Z');
    const points = fillBuckets(from, to, 'day', '%Y-%m-%d', []);

    for (const p of points) {
      expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
      expect(new Date(p.date).toISOString()).toBe(p.date);
    }
  });

  // ─── Timezone-aware tests ───

  it('matches bucket keys with timezone offset (UTC+3)', () => {
    // ClickHouse with toStartOfDay(timestamp, 'Europe/Istanbul') produces bucket '2024-01-15'
    // for events at 2024-01-14T21:00:00Z (which is 2024-01-15T00:00:00 in Istanbul)
    const from = new Date('2024-01-14T21:00:00Z'); // midnight Istanbul
    const to = new Date('2024-01-15T20:59:00Z');   // 23:59 Istanbul
    const rows = [{ _id: '2024-01-15', value: 42 }];

    const points = fillBuckets(from, to, 'day', '%Y-%m-%d', rows, 'Europe/Istanbul');

    expect(points.some((p) => p.value === 42)).toBe(true);
  });

  it('matches bucket keys with timezone offset (UTC-5)', () => {
    // Midnight in New_York EST = 05:00 UTC
    const from = new Date('2024-01-15T05:00:00Z');
    const to = new Date('2024-01-16T04:59:00Z');
    const rows = [{ _id: '2024-01-15', value: 7 }];

    const points = fillBuckets(from, to, 'day', '%Y-%m-%d', rows, 'America/New_York');

    expect(points.some((p) => p.value === 7)).toBe(true);
  });

  it('without timezone uses pure UTC (no shift)', () => {
    const from = new Date('2024-01-15T00:00:00Z');
    const to = new Date('2024-01-15T23:59:00Z');
    const rows = [{ _id: '2024-01-15', value: 99 }];

    const points = fillBuckets(from, to, 'day', '%Y-%m-%d', rows);

    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(99);
    expect(points[0].date).toBe('2024-01-15T00:00:00.000Z');
  });

  it('timezone-shifted output dates are real UTC', () => {
    const from = new Date('2024-01-14T21:00:00Z');
    const to = new Date('2024-01-16T20:59:00Z');

    const points = fillBuckets(from, to, 'day', '%Y-%m-%d', [], 'Europe/Istanbul');

    for (const p of points) {
      const d = new Date(p.date);
      expect(d.toISOString()).toBe(p.date); // valid ISO
      expect(Number.isNaN(d.getTime())).toBe(false);
    }
  });

  it('hourly buckets with timezone produce correct count', () => {
    const from = new Date('2024-01-15T00:00:00Z');
    const to = new Date('2024-01-15T05:59:00Z');

    const points = fillBuckets(from, to, 'hour', '%Y-%m-%dT%H:00', [], 'Europe/Istanbul');

    // 6 hours from 00:00 to 05:59 UTC → 6 hourly buckets
    expect(points).toHaveLength(6);
  });

  // ─── DST regression ───

  it('handles DST spring-forward: daily buckets span March 10 2024 correctly', () => {
    // US spring-forward: March 10 2024. EST→EDT at 2am local (7am UTC).
    // Range: March 8–12 in New York time.
    // March 8 midnight ET = March 8 05:00 UTC (EST, -5)
    // March 12 midnight ET = March 12 04:00 UTC (EDT, -4)
    const from = new Date('2024-03-08T05:00:00Z');
    const to = new Date('2024-03-12T03:59:00Z');

    // Simulate ClickHouse output with timezone-aware day buckets
    const rows = [
      { _id: '2024-03-08', value: 10 },
      { _id: '2024-03-09', value: 20 },
      { _id: '2024-03-10', value: 30 }, // DST transition day
      { _id: '2024-03-11', value: 40 },
    ];

    const points = fillBuckets(from, to, 'day', '%Y-%m-%d', rows, 'America/New_York');

    // Should have at least 4 buckets and match all values (not zero after DST)
    expect(points.length).toBeGreaterThanOrEqual(4);
    const values = points.map((p) => p.value);
    expect(values).toContain(10);
    expect(values).toContain(20);
    expect(values).toContain(30);
    expect(values).toContain(40);
    // No data should be lost — every row value must appear
    expect(values.filter((v) => v > 0)).toHaveLength(4);
  });

  it('handles DST fall-back: daily buckets span Nov 3 2024 correctly', () => {
    // US fall-back: Nov 3 2024. EDT→EST at 2am local (6am UTC).
    // Nov 1 midnight ET = Nov 1 04:00 UTC (EDT, -4)
    // Nov 5 midnight ET = Nov 5 05:00 UTC (EST, -5)
    const from = new Date('2024-11-01T04:00:00Z');
    const to = new Date('2024-11-05T04:59:00Z');

    const rows = [
      { _id: '2024-11-01', value: 1 },
      { _id: '2024-11-02', value: 2 },
      { _id: '2024-11-03', value: 3 }, // DST transition day
      { _id: '2024-11-04', value: 4 },
    ];

    const points = fillBuckets(from, to, 'day', '%Y-%m-%d', rows, 'America/New_York');

    const values = points.map((p) => p.value);
    expect(values).toContain(1);
    expect(values).toContain(2);
    expect(values).toContain(3);
    expect(values).toContain(4);
    expect(values.filter((v) => v > 0)).toHaveLength(4);
  });
});

// ─── generateSiteId ──────────────────────────────────

describe('generateSiteId', () => {
  it('starts with site_ prefix', () => {
    expect(generateSiteId()).toMatch(/^site_/);
  });

  it('is 17 characters total', () => {
    expect(generateSiteId()).toHaveLength(17);
  });

  it('random part is lowercase alphanumeric', () => {
    const id = generateSiteId();
    expect(id.slice(5)).toMatch(/^[a-z0-9]{12}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateSiteId()));
    expect(ids.size).toBe(100);
  });
});

// ─── generateSecretKey ───────────────────────────────

describe('generateSecretKey', () => {
  it('starts with sk_ prefix', () => {
    expect(generateSecretKey()).toMatch(/^sk_/);
  });

  it('is 67 characters total', () => {
    expect(generateSecretKey()).toHaveLength(67);
  });

  it('hex part is valid hex', () => {
    const key = generateSecretKey();
    expect(key.slice(3)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique keys', () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateSecretKey()));
    expect(keys.size).toBe(100);
  });
});

// ─── R2: capLimit (top-N + list caps) ────────────────

describe('capLimit', () => {
  it('clamps an oversized top-N limit to the 1000 max', () => {
    expect(capLimit(100000, 10, 1000)).toBe(1000);
  });

  it('falls back to the default when limit is undefined', () => {
    expect(capLimit(undefined, 10, 1000)).toBe(10);
    expect(capLimit(undefined, 50, 200)).toBe(50);
  });

  it('passes a within-bounds limit through unchanged', () => {
    expect(capLimit(25, 10, 1000)).toBe(25);
  });

  it('clamps the events/users list cap at 200', () => {
    expect(capLimit(5000, 50, 200)).toBe(200);
  });

  it('returns exactly the max at the boundary', () => {
    expect(capLimit(1000, 10, 1000)).toBe(1000);
    expect(capLimit(1001, 10, 1000)).toBe(1000);
  });
});

// ─── R3: timeseries bucket budget ────────────────────

describe('countBuckets', () => {
  const day = 24 * 60 * 60 * 1000;

  it('counts hourly buckets over 7 days (<= 2000)', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date(from.getTime() + 7 * day);
    // 7*24 = 168 hours + 1 inclusive bucket
    expect(countBuckets(from, to, 'hour')).toBe(169);
  });

  it('counts hourly buckets over 90 days (> 2000)', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date(from.getTime() + 90 * day);
    expect(countBuckets(from, to, 'hour')).toBe(90 * 24 + 1);
  });

  it('counts daily buckets over 30 days', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date(from.getTime() + 30 * day);
    expect(countBuckets(from, to, 'day')).toBe(31);
  });

  it('never returns negative for an inverted range', () => {
    const from = new Date('2026-02-01T00:00:00Z');
    const to = new Date('2026-01-01T00:00:00Z');
    expect(countBuckets(from, to, 'hour')).toBe(1);
  });
});

describe('assertTimeseriesBudget', () => {
  const day = 24 * 60 * 60 * 1000;

  it('passes for 7d + hour (169 buckets)', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date(from.getTime() + 7 * day);
    expect(() => assertTimeseriesBudget(from, to, 'hour')).not.toThrow();
  });

  it('rejects 90d + hour with a QueryValidationError carrying statusCode 400', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date(from.getTime() + 90 * day);
    let caught: unknown;
    try {
      assertTimeseriesBudget(from, to, 'hour');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(QueryValidationError);
    expect((caught as QueryValidationError).statusCode).toBe(400);
  });

  it('suggests a coarser granularity in the rejection message', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date(from.getTime() + 365 * day);
    expect(() => assertTimeseriesBudget(from, to, 'hour')).toThrow(/coarser granularity.*"day"/);
  });

  it('does not suggest a coarser granularity when already at month', () => {
    // 3000 months would be needed; use a huge range to force > 2000 month buckets
    const from = new Date('1000-01-01T00:00:00Z');
    const to = new Date('3026-01-01T00:00:00Z');
    expect(() => assertTimeseriesBudget(from, to, 'month')).toThrow(/shorter period/);
  });

  it('respects a custom max', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date(from.getTime() + 5 * day);
    // 5 daily buckets, max 3 → reject
    expect(() => assertTimeseriesBudget(from, to, 'day', 3)).toThrow(QueryValidationError);
  });

  it('exposes the default max of 2000', () => {
    expect(MAX_TIMESERIES_BUCKETS).toBe(2000);
  });
});
