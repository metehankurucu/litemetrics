import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getProviderBaseUrl, createAnalyticsClientForProvider } from '../client';
import { useAuthStore } from '../../stores/auth-store';
import type { Period, SiteType } from '@litemetrics/core';

function getClient(activeSiteId: string, adminSecret: string) {
  return createAnalyticsClientForProvider(getProviderBaseUrl(), activeSiteId, adminSecret);
}

interface DateRange {
  dateFrom: string;
  dateTo: string;
}

function buildOpts(period: Period, filters?: Record<string, string>, dateRange?: DateRange) {
  return {
    period,
    ...(filters ? { filters } : {}),
    ...(dateRange ? { dateFrom: dateRange.dateFrom, dateTo: dateRange.dateTo } : {}),
  };
}

export function useOverview(period: Period = '7d', filters?: Record<string, string>, dateRange?: DateRange) {
  const { activeProviderId, activeSiteId, adminSecret } = useAuthStore();

  return useQuery({
    queryKey: [...queryKeys.overview(activeSiteId, period), filters, dateRange],
    queryFn: async () => {
      if (!activeProviderId || !activeSiteId || !adminSecret) throw new Error('Not authenticated');
      const client = getClient(activeSiteId, adminSecret);
      return client.getOverview(['pageviews', 'visitors', 'sessions', 'events', 'conversions'], { ...buildOpts(period, filters, dateRange), compare: true });
    },
    enabled: !!activeProviderId && !!activeSiteId && !!adminSecret,
  });
}

export function useStats(metric: string, period: Period = '7d') {
  const { activeProviderId, activeSiteId, adminSecret } = useAuthStore();

  return useQuery({
    queryKey: queryKeys.analytics(activeSiteId, period),
    queryFn: async () => {
      if (!activeProviderId || !activeSiteId || !adminSecret) throw new Error('Not authenticated');
      const client = getClient(activeSiteId, adminSecret);
      return client.getStats(metric as any, { period });
    },
    enabled: !!activeProviderId && !!activeSiteId && !!adminSecret,
  });
}

export function useTimeSeries(
  metric: 'pageviews' | 'visitors' | 'sessions' | 'events' | 'conversions',
  period: Period = '7d',
  filters?: Record<string, string>,
  dateRange?: DateRange,
) {
  const { activeProviderId, activeSiteId, adminSecret } = useAuthStore();

  return useQuery({
    queryKey: [...queryKeys.timeSeries(activeSiteId, metric, period), filters, dateRange],
    queryFn: async () => {
      if (!activeProviderId || !activeSiteId || !adminSecret) throw new Error('Not authenticated');
      const client = getClient(activeSiteId, adminSecret);
      return client.getTimeSeries(metric, buildOpts(period, filters, dateRange));
    },
    enabled: !!activeProviderId && !!activeSiteId && !!adminSecret,
  });
}

export function useTopMetrics(
  period: Period = '7d',
  siteType?: SiteType,
  filters?: Record<string, string>,
  dateRange?: DateRange,
) {
  const { activeProviderId, activeSiteId, adminSecret } = useAuthStore();
  const isApp = siteType === 'app';

  return useQuery({
    queryKey: [...queryKeys.topMetrics(activeSiteId, period), siteType ?? 'web', filters, dateRange],
    queryFn: async () => {
      if (!activeProviderId || !activeSiteId || !adminSecret) throw new Error('Not authenticated');
      const client = getClient(activeSiteId, adminSecret);
      const opts = buildOpts(period, filters, dateRange);

      if (isApp) {
        const [topPages, topCountries, topEvents, topConversions, topOS, topOSVersions, topDeviceModels, topAppVersions] = await Promise.all([
          client.getTopPages(opts),
          client.getTopCountries(opts),
          client.getTopEvents(opts),
          client.getStats('top_conversions', opts),
          client.getTopOS(opts),
          client.getStats('top_os_versions', opts),
          client.getStats('top_device_models', opts),
          client.getStats('top_app_versions', opts),
        ]);
        return { topPages, topCountries, topEvents, topConversions, topOS, topOSVersions, topDeviceModels, topAppVersions };
      }

      const [topPages, topReferrers, topCountries, topEvents, topConversions, topDevices, topBrowsers] = await Promise.all([
        client.getTopPages(opts),
        client.getTopReferrers(opts),
        client.getTopCountries(opts),
        client.getTopEvents(opts),
        client.getStats('top_conversions', opts),
        client.getTopDevices(opts),
        client.getTopBrowsers(opts),
      ]);
      return { topPages, topReferrers, topCountries, topEvents, topConversions, topDevices, topBrowsers };
    },
    enabled: !!activeProviderId && !!activeSiteId && !!adminSecret,
  });
}

export function useLiveVisitors() {
  const { activeProviderId, activeSiteId, adminSecret } = useAuthStore();

  return useQuery({
    queryKey: queryKeys.realtime(activeSiteId),
    queryFn: async () => {
      if (!activeProviderId || !activeSiteId || !adminSecret) throw new Error('Not authenticated');
      const client = getClient(activeSiteId, adminSecret);
      const result = await client.getStats('visitors', { period: '1h' });
      return result.total;
    },
    enabled: !!activeProviderId && !!activeSiteId && !!adminSecret,
    refetchInterval: 10_000,
  });
}
