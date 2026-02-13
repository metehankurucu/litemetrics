import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getProviderBaseUrl, createAnalyticsClientForProvider } from '../client';
import { useAuthStore } from '../../stores/auth-store';
import type { Period, Metric } from '@litemetrics/core';

export function useCampaigns(metric: Metric, period: Period = '7d') {
  const { activeProviderId, activeSiteId, adminSecret } = useAuthStore();

  return useQuery({
    queryKey: queryKeys.campaigns(activeSiteId, period, metric),
    queryFn: async () => {
      if (!activeProviderId || !activeSiteId || !adminSecret) throw new Error('Not authenticated');
      const client = createAnalyticsClientForProvider(getProviderBaseUrl(), activeSiteId, adminSecret);
      return client.getStats(metric, { period });
    },
    enabled: !!activeProviderId && !!activeSiteId && !!adminSecret,
  });
}
