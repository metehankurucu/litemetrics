import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getProviderBaseUrl, createAnalyticsClientForProvider } from '../client';
import { useAuthStore } from '../../stores/auth-store';
import type { UsersListOptions } from '@litemetrics/client';

export function useUsers(options?: UsersListOptions) {
  const { activeProviderId, activeSiteId, adminSecret } = useAuthStore();

  return useQuery({
    queryKey: queryKeys.users(activeSiteId, options),
    queryFn: async () => {
      if (!activeProviderId || !activeSiteId || !adminSecret) throw new Error('Not authenticated');
      const client = createAnalyticsClientForProvider(getProviderBaseUrl(), activeSiteId, adminSecret);
      return client.getUsers({ limit: 50, ...options });
    },
    enabled: !!activeProviderId && !!activeSiteId && !!adminSecret,
    staleTime: 30_000,
  });
}

export function useUserDetail(identifier: string) {
  const { activeProviderId, activeSiteId, adminSecret } = useAuthStore();

  return useQuery({
    queryKey: queryKeys.user(identifier),
    queryFn: async () => {
      if (!activeProviderId || !activeSiteId || !adminSecret) throw new Error('Not authenticated');
      const client = createAnalyticsClientForProvider(getProviderBaseUrl(), activeSiteId, adminSecret);
      return client.getUserDetail(identifier);
    },
    enabled: !!activeProviderId && !!activeSiteId && !!adminSecret && !!identifier,
  });
}

export function useUserEvents(identifier: string, page: number = 0, limit: number = 30) {
  const { activeProviderId, activeSiteId, adminSecret } = useAuthStore();

  return useQuery({
    queryKey: queryKeys.userEvents(activeSiteId, identifier, page),
    queryFn: async () => {
      if (!activeProviderId || !activeSiteId || !adminSecret) throw new Error('Not authenticated');
      const client = createAnalyticsClientForProvider(getProviderBaseUrl(), activeSiteId, adminSecret);
      return client.getUserEvents(identifier, { limit, offset: page * limit });
    },
    enabled: !!activeProviderId && !!activeSiteId && !!adminSecret && !!identifier,
  });
}
