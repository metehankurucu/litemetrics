import type { QueryParams, Period, Granularity, TimeSeriesPoint } from '@insayt/core';
import { randomBytes } from 'crypto';

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
): TimeSeriesPoint[] {
  const map = new Map(rows.map((r) => [r._id, r.value]));
  const points: TimeSeriesPoint[] = [];
  const current = new Date(from);

  // Align to bucket start
  if (granularity === 'hour') {
    current.setMinutes(0, 0, 0);
  } else if (granularity === 'day') {
    current.setHours(0, 0, 0, 0);
  } else if (granularity === 'week') {
    const day = current.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    current.setDate(current.getDate() + diff);
    current.setHours(0, 0, 0, 0);
  } else if (granularity === 'month') {
    current.setDate(1);
    current.setHours(0, 0, 0, 0);
  }

  while (current <= to) {
    const key = formatDateBucket(current, dateFormat);
    points.push({ date: current.toISOString(), value: map.get(key) ?? 0 });

    if (granularity === 'hour') {
      current.setHours(current.getHours() + 1);
    } else if (granularity === 'day') {
      current.setDate(current.getDate() + 1);
    } else if (granularity === 'week') {
      current.setDate(current.getDate() + 7);
    } else if (granularity === 'month') {
      current.setMonth(current.getMonth() + 1);
    }
  }

  return points;
}

export function formatDateBucket(date: Date, format: string): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');

  if (format === '%Y-%m-%dT%H:00') return `${y}-${m}-${d}T${h}:00`;
  if (format === '%Y-%m-%d') return `${y}-${m}-${d}`;
  if (format === '%Y-%m') return `${y}-${m}`;
  if (format === '%G-W%V') {
    const jan4 = new Date(y, 0, 4);
    const dayOfYear = Math.ceil((date.getTime() - new Date(y, 0, 1).getTime()) / 86400000) + 1;
    const jan4Day = jan4.getDay() || 7;
    const weekNum = Math.ceil((dayOfYear + jan4Day - 1) / 7);
    return `${y}-W${String(weekNum).padStart(2, '0')}`;
  }
  return date.toISOString();
}

export function getISOWeek(date: Date): string {
  const y = date.getFullYear();
  const jan4 = new Date(y, 0, 4);
  const dayOfYear = Math.ceil((date.getTime() - new Date(y, 0, 1).getTime()) / 86400000) + 1;
  const jan4Day = jan4.getDay() || 7;
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
