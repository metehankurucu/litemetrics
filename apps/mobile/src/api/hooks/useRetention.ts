import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getProviderBaseUrl, createAnalyticsClientForProvider } from '../client';
import { useAuthStore } from '../../stores/auth-store';
import type { Period } from '@litemetrics/core';

export function useRetention(period: Period = '90d', weeks: number = 8) {
  const { activeProviderId, activeSiteId, adminSecret } = useAuthStore();

  return useQuery({
    queryKey: queryKeys.retention(activeSiteId, period, weeks),
    queryFn: async () => {
      if (!activeProviderId || !activeSiteId || !adminSecret) throw new Error('Not authenticated');
      const client = createAnalyticsClientForProvider(getProviderBaseUrl(), activeSiteId, adminSecret);
      return client.getRetention({ period, weeks });
    },
    enabled: !!activeProviderId && !!activeSiteId && !!adminSecret,
  });
}
