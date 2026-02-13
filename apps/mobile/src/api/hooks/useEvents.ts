import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getProviderBaseUrl, createAnalyticsClientForProvider } from '../client';
import { useAuthStore } from '../../stores/auth-store';
import type { EventsListOptions } from '@litemetrics/client';

export function useEvents(options?: EventsListOptions) {
  const { activeProviderId, activeSiteId, adminSecret } = useAuthStore();

  return useQuery({
    queryKey: queryKeys.events(activeSiteId, options),
    queryFn: async () => {
      if (!activeProviderId || !activeSiteId || !adminSecret) throw new Error('Not authenticated');
      const client = createAnalyticsClientForProvider(getProviderBaseUrl(), activeSiteId, adminSecret);
      return client.getEventsList({ limit: 50, ...options });
    },
    enabled: !!activeProviderId && !!activeSiteId && !!adminSecret,
    staleTime: 10_000,
  });
}
