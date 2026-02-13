import { useAuthStore } from '../stores/auth-store';
import { LitemetricsClient, SitesClient } from '@litemetrics/client';

export function getProviderBaseUrl(): string {
  const { activeProviderId, providers } = useAuthStore.getState();
  const provider = providers.find(p => p.id === activeProviderId);
  if (!provider) throw new Error('Provider not found');
  return provider.baseUrl;
}

export function getActiveClient(siteId?: string): LitemetricsClient | null {
  const state = useAuthStore.getState();
  const { activeProviderId, adminSecret } = state;

  if (!activeProviderId || !adminSecret) return null;

  const provider = state.providers.find(p => p.id === activeProviderId);
  if (!provider) return null;

  const currentSiteId = siteId || state.activeSiteId;
  if (!currentSiteId) return null;

  return new LitemetricsClient({
    baseUrl: provider.baseUrl,
    siteId: currentSiteId,
    headers: { 'X-Litemetrics-Admin-Secret': adminSecret },
  });
}

export function getSitesClient(): SitesClient | null {
  const state = useAuthStore.getState();
  const { activeProviderId, adminSecret } = state;

  if (!activeProviderId || !adminSecret) return null;

  const provider = state.providers.find(p => p.id === activeProviderId);
  if (!provider) return null;

  return new SitesClient({ baseUrl: provider.baseUrl, adminSecret });
}

export function createSitesClientForProvider(baseUrl: string, adminSecret: string): SitesClient {
  return new SitesClient({ baseUrl, adminSecret });
}

export function createAnalyticsClientForProvider(baseUrl: string, siteId: string, adminSecret: string): LitemetricsClient {
  return new LitemetricsClient({
    baseUrl,
    siteId,
    headers: { 'X-Litemetrics-Admin-Secret': adminSecret },
  });
}
