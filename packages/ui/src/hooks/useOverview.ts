import { useQuery } from '@tanstack/react-query';
import type { Metric, Period, QueryResult } from '@litemetrics/core';
import { useLitemetricsUI } from './useLitemetricsUI';
import { queryKeys } from './queryKeys';

interface UseOverviewOptions {
  period?: Period;
  metrics?: Metric[];
  enabled?: boolean;
}

export function useOverview(options?: UseOverviewOptions) {
  const { client, siteId, period: ctxPeriod, dateFrom, dateTo, staleTime } = useLitemetricsUI();
  const period = options?.period ?? ctxPeriod;
  const metrics = options?.metrics ?? ['pageviews', 'visitors', 'sessions', 'events'] as Metric[];

  const statsOptions = period === 'custom' && dateFrom && dateTo
    ? { period, dateFrom: new Date(dateFrom).toISOString(), dateTo: new Date(dateTo + 'T23:59:59').toISOString(), compare: true }
    : { period, compare: true };

  return useQuery<Record<Metric, QueryResult>>({
    queryKey: queryKeys.overview(siteId, period, dateFrom, dateTo),
    queryFn: async () => {
      client.setSiteId(siteId);
      return client.getOverview(metrics, statsOptions);
    },
    staleTime,
    enabled: options?.enabled !== false && (period !== 'custom' || (!!dateFrom && !!dateTo)),
  });
}
