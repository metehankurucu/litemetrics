import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getProviderBaseUrl, createAnalyticsClientForProvider } from '../client';
import { useAuthStore } from '../../stores/auth-store';
import type { Period } from '@litemetrics/core';

function getClient(activeSiteId: string, adminSecret: string) {
  return createAnalyticsClientForProvider(getProviderBaseUrl(), activeSiteId, adminSecret);
}

export function useInsights(period: Period = '7d') {
  const { activeProviderId, activeSiteId, adminSecret } = useAuthStore();

  return useQuery({
    queryKey: queryKeys.insights(activeSiteId, period),
    queryFn: async () => {
      if (!activeProviderId || !activeSiteId || !adminSecret) throw new Error('Not authenticated');
      const client = getClient(activeSiteId, adminSecret);
      const [exitPages, transitions, scrollPages, buttonClicks, linkTargets] = await Promise.all([
        client.getStats('top_exit_pages', { period }),
        client.getStats('top_transitions', { period }),
        client.getStats('top_scroll_pages', { period }),
        client.getStats('top_button_clicks', { period }),
        client.getStats('top_link_targets', { period }),
      ]);
      return { exitPages, transitions, scrollPages, buttonClicks, linkTargets };
    },
    enabled: !!activeProviderId && !!activeSiteId && !!adminSecret,
  });
}

export function useInsightsHourly(period: Period = '7d') {
  const { activeProviderId, activeSiteId, adminSecret } = useAuthStore();

  return useQuery({
    queryKey: queryKeys.insightsHourly(activeSiteId, period),
    queryFn: async () => {
      if (!activeProviderId || !activeSiteId || !adminSecret) throw new Error('Not authenticated');
      const client = getClient(activeSiteId, adminSecret);
      const [events, conversions] = await Promise.all([
        client.getTimeSeries('events', { period, granularity: 'hour' }),
        client.getTimeSeries('conversions', { period, granularity: 'hour' }),
      ]);
      return { events, conversions };
    },
    enabled: !!activeProviderId && !!activeSiteId && !!adminSecret,
  });
}
