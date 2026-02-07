import { useQuery } from '@tanstack/react-query';
import type { Period, TimeSeriesResult } from '@litemetrics/core';
import type { ChartMetric } from '../types';
import { useLitemetricsUI } from './useLitemetricsUI';
import { queryKeys } from './queryKeys';

interface UseTimeSeriesOptions {
  period?: Period;
  enabled?: boolean;
}

export function useTimeSeries(metric: ChartMetric, options?: UseTimeSeriesOptions) {
  const { client, siteId, period: ctxPeriod, staleTime } = useLitemetricsUI();
  const period = options?.period ?? ctxPeriod;

  return useQuery<TimeSeriesResult>({
    queryKey: queryKeys.timeSeries(siteId, metric, period),
    queryFn: async () => {
      client.setSiteId(siteId);
      return client.getTimeSeries(metric, { period });
    },
    staleTime,
    enabled: options?.enabled !== false,
  });
}
