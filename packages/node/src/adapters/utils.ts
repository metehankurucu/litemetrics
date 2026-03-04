import type { QueryParams, Period, Granularity, TimeSeriesPoint } from '@litemetrics/core';
import { randomBytes } from 'crypto';

/** Get the offset in ms between UTC and the given IANA timezone at a specific instant. */
export function getTimezoneOffsetMs(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  const y = parseInt(get('year'));
  const m = parseInt(get('month')) - 1;
  const d = parseInt(get('day'));
  const h = parseInt(get('hour') === '24' ? '0' : get('hour'));
  const mi = parseInt(get('minute'));
  const s = parseInt(get('second'));
  return Date.UTC(y, m, d, h, mi, s) - date.getTime();
}

/** Parse a value as UTC. Appends 'Z' to bare datetime strings so they aren't parsed as local. */
export function toUTCDate(value: string | Date | number): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const s = String(value).trim();
  // If string has no timezone indicator (Z, +, -offset), treat as UTC
  if (s.length >= 10 && !s.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s.replace(' ', 'T') + 'Z');
  }
  return new Date(s);
}

export function resolvePeriod(q: Pick<QueryParams, 'period' | 'dateFrom' | 'dateTo'>): { dateRange: { from: string; to: string }; period: Period } {
  const now = new Date();
  const period = q.period ?? '7d';

  if (period === 'custom' && q.dateFrom && q.dateTo) {
    return { dateRange: { from: q.dateFrom, to: q.dateTo }, period };
  }

  const to = now.toISOString();
  let from: Date;

  switch (period) {
    case '1h':  from = new Date(now.getTime() - 60 * 60 * 1000); break;
    case '24h': from = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
    case '7d':  from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
    case '30d': from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
    case '90d': from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
    default:    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
  }

  return { dateRange: { from: from.toISOString(), to }, period };
}

export function previousPeriodRange(currentRange: { from: string; to: string }): { from: string; to: string } {
  const from = new Date(currentRange.from);
  const to = new Date(currentRange.to);
  const duration = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - duration);
  return { from: prevFrom.toISOString(), to: prevTo.toISOString() };
}

export function autoGranularity(period: Period): Granularity {
  switch (period) {
    case '1h': return 'hour';
    case '24h': return 'hour';
    case '7d': return 'day';
    case '30d': return 'day';
    case '90d': return 'week';
    default: return 'day';
  }
}

export function granularityToDateFormat(g: Granularity): string {
  switch (g) {
    case 'hour': return '%Y-%m-%dT%H:00';
    case 'day': return '%Y-%m-%d';
    case 'week': return '%G-W%V';
    case 'month': return '%Y-%m';
  }
}

export function fillBuckets(
  from: Date,
  to: Date,
  granularity: Granularity,
  dateFormat: string,
  rows: { _id: string; value: number }[],
  timezone?: string,
): TimeSeriesPoint[] {
  const map = new Map(rows.map((r) => [r._id, r.value]));
  const points: TimeSeriesPoint[] = [];

  // When timezone is provided, shift from/to to wall-clock so bucket keys
  // align with ClickHouse's timezone-aware toStartOf* output.
  // Use separate offsets for from/to to handle DST transitions correctly.
  const fromOffset = timezone ? getTimezoneOffsetMs(from, timezone) : 0;
  const toOffset = timezone ? getTimezoneOffsetMs(to, timezone) : 0;
  const current = new Date(from.getTime() + fromOffset);
  const toWall = new Date(to.getTime() + toOffset);

  // Align to bucket start (using UTC methods on wall-clock shifted dates)
  if (granularity === 'hour') {
    current.setUTCMinutes(0, 0, 0);
  } else if (granularity === 'day') {
    current.setUTCHours(0, 0, 0, 0);
  } else if (granularity === 'week') {
    const day = current.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    current.setUTCDate(current.getUTCDate() + diff);
    current.setUTCHours(0, 0, 0, 0);
  } else if (granularity === 'month') {
    current.setUTCDate(1);
    current.setUTCHours(0, 0, 0, 0);
  }

  while (current <= toWall) {
    const key = formatDateBucket(current, dateFormat);
    // Shift back to real UTC for the date field.
    // Recompute offset per-bucket to handle DST transitions correctly.
    const approxUtc = new Date(current.getTime() - fromOffset);
    const exactOffset = timezone ? getTimezoneOffsetMs(approxUtc, timezone) : 0;
    const realUtc = new Date(current.getTime() - exactOffset);
    points.push({ date: realUtc.toISOString(), value: map.get(key) ?? 0 });

    if (granularity === 'hour') {
      current.setUTCHours(current.getUTCHours() + 1);
    } else if (granularity === 'day') {
      current.setUTCDate(current.getUTCDate() + 1);
    } else if (granularity === 'week') {
      current.setUTCDate(current.getUTCDate() + 7);
    } else if (granularity === 'month') {
      current.setUTCMonth(current.getUTCMonth() + 1);
    }
  }

  return points;
}

export function formatDateBucket(date: Date, format: string): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');

  if (format === '%Y-%m-%dT%H:00') return `${y}-${m}-${d}T${h}:00`;
  if (format === '%Y-%m-%d') return `${y}-${m}-${d}`;
  if (format === '%Y-%m') return `${y}-${m}`;
  if (format === '%G-W%V') {
    const jan4 = new Date(Date.UTC(y, 0, 4));
    const dayOfYear = Math.ceil((date.getTime() - Date.UTC(y, 0, 1)) / 86400000) + 1;
    const jan4Day = jan4.getUTCDay() || 7;
    const weekNum = Math.ceil((dayOfYear + jan4Day - 1) / 7);
    return `${y}-W${String(weekNum).padStart(2, '0')}`;
  }
  return date.toISOString();
}

export function getISOWeek(date: Date): string {
  const y = date.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const dayOfYear = Math.ceil((date.getTime() - Date.UTC(y, 0, 1)) / 86400000) + 1;
  const jan4Day = jan4.getUTCDay() || 7;
  const weekNum = Math.ceil((dayOfYear + jan4Day - 1) / 7);
  return `${y}-W${String(weekNum).padStart(2, '0')}`;
}

export function generateSiteId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(12);
  let id = '';
  for (let i = 0; i < 12; i++) id += chars[bytes[i] % chars.length];
  return `site_${id}`;
}

export function generateSecretKey(): string {
  return `sk_${randomBytes(32).toString('hex')}`;
}
