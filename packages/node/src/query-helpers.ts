import type { QueryParams } from '@litemetrics/core';

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
  return {
    siteId: q.siteId as string,
    metric: q.metric as QueryParams['metric'],
    period: q.period as QueryParams['period'],
    dateFrom: q.dateFrom as string | undefined,
    dateTo: q.dateTo as string | undefined,
    limit: q.limit ? parseInt(q.limit as string, 10) : undefined,
    filters: q.filters ? JSON.parse(q.filters as string) : undefined,
    compare: q.compare === 'true' || q.compare === '1',
    timezone,
  };
}
