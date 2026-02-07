import { useQuery } from '@tanstack/react-query';
import type { Metric, Period, QueryResult } from '@litemetrics/core';
import { useLitemetricsUI } from './useLitemetricsUI';
import { queryKeys } from './queryKeys';

interface UseStatsOptions {
  period?: Period;
  limit?: number;
  enabled?: boolean;
}

export function useStats(metric: Metric, options?: UseStatsOptions) {
  const { client, siteId, period: ctxPeriod, dateFrom, dateTo, staleTime } = useLitemetricsUI();
  const period = options?.period ?? ctxPeriod;

  const statsOptions = period === 'custom' && dateFrom && dateTo
    ? { period, dateFrom: new Date(dateFrom).toISOString(), dateTo: new Date(dateTo + 'T23:59:59').toISOString(), limit: options?.limit, compare: true }
    : { period, limit: options?.limit, compare: true };

  return useQuery<QueryResult>({
    queryKey: queryKeys.stats(siteId, metric, period, dateFrom, dateTo),
    queryFn: async () => {
      client.setSiteId(siteId);
      return client.getStats(metric, statsOptions);
    },
    staleTime,
    enabled: options?.enabled !== false && (period !== 'custom' || (!!dateFrom && !!dateTo)),
  });
}
