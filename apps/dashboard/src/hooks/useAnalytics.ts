import { useState, useCallback } from 'react';
import { createClient } from '@litemetrics/client';

const client = createClient({
  baseUrl: import.meta.env.VITE_LITEMETRICS_URL || '',
  siteId: import.meta.env.VITE_LITEMETRICS_SITE_ID || 'demo',
});

export { client };

// Query key factory - all query keys in one place
export const queryKeys = {
  analytics: (siteId: string, period: string, dateFrom?: string, dateTo?: string, filters?: Record<string, string>) =>
    ['analytics', siteId, period, dateFrom, dateTo, filters] as const,
  timeSeries: (siteId: string, period: string, metric: string, filters?: Record<string, string>) =>
    ['timeSeries', siteId, period, metric, filters] as const,
  worldMap: (siteId: string, period: string, filters?: Record<string, string>) =>
    ['worldMap', siteId, period, filters] as const,
  insights: (siteId: string, period: string, dateFrom?: string, dateTo?: string, filters?: Record<string, string>) =>
    ['insights', siteId, period, dateFrom, dateTo, filters] as const,
  insightsHourly: (siteId: string, period: string, dateFrom?: string, dateTo?: string, filters?: Record<string, string>) =>
    ['insightsHourly', siteId, period, dateFrom, dateTo, filters] as const,
  events: (siteId: string, filters: Record<string, unknown>) =>
    ['events', siteId, filters] as const,
  users: (siteId: string, filters: Record<string, unknown>) =>
    ['users', siteId, filters] as const,
  userDetail: (siteId: string, visitorId: string) =>
    ['userDetail', siteId, visitorId] as const,
  userEvents: (siteId: string, visitorId: string, filters: Record<string, unknown>) =>
    ['userEvents', siteId, visitorId, filters] as const,
  retention: (siteId: string, period: string, weeks: number) =>
    ['retention', siteId, period, weeks] as const,
  realtime: (siteId: string) =>
    ['realtime', siteId] as const,
  live: (siteId: string) =>
    ['live', siteId] as const,
  sites: () => ['sites'] as const,
};

export function useSiteId() {
  const [siteId, setSiteIdState] = useState(
    import.meta.env.VITE_LITEMETRICS_SITE_ID || 'demo',
  );

  const setSiteId = useCallback((id: string) => {
    client.setSiteId(id);
    setSiteIdState(id);
  }, []);

  return { siteId, setSiteId };
}
