import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getSitesClient, getProviderBaseUrl, createSitesClientForProvider } from '../client';
import { useAuthStore } from '../../stores/auth-store';
import type { CreateSiteRequest, UpdateSiteRequest } from '@litemetrics/core';

export function useSites() {
  const { activeProviderId } = useAuthStore();

  return useQuery({
    queryKey: queryKeys.sites(),
    queryFn: async () => {
      const client = getSitesClient();
      if (!client) throw new Error('No active provider');
      const { sites } = await client.listSites();
      return sites;
    },
    enabled: !!activeProviderId,
  });
}

export function useSite(siteId: string) {
  const { activeProviderId } = useAuthStore();

  return useQuery({
    queryKey: queryKeys.site(siteId),
    queryFn: async () => {
      const client = getSitesClient();
      if (!client) throw new Error('No active provider');
      const { site } = await client.getSite(siteId);
      return site;
    },
    enabled: !!activeProviderId && !!siteId,
  });
}

export function useCreateSite() {
  const queryClient = useQueryClient();
  const { activeProviderId, adminSecret } = useAuthStore();

  return useMutation({
    mutationFn: async (data: CreateSiteRequest) => {
      if (!activeProviderId || !adminSecret) throw new Error('No active provider');
      const client = createSitesClientForProvider(getProviderBaseUrl(), adminSecret);
      const { site } = await client.createSite(data);
      return site;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sites() });
    },
  });
}

export function useUpdateSite() {
  const queryClient = useQueryClient();
  const { activeProviderId, adminSecret } = useAuthStore();

  return useMutation({
    mutationFn: async ({ siteId, data }: { siteId: string; data: UpdateSiteRequest }) => {
      if (!activeProviderId || !adminSecret) throw new Error('No active provider');
      const client = createSitesClientForProvider(getProviderBaseUrl(), adminSecret);
      const { site } = await client.updateSite(siteId, data);
      return site;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sites() });
    },
  });
}

export function useDeleteSite() {
  const queryClient = useQueryClient();
  const { activeProviderId, adminSecret } = useAuthStore();

  return useMutation({
    mutationFn: async (siteId: string) => {
      if (!activeProviderId || !adminSecret) throw new Error('No active provider');
      const client = createSitesClientForProvider(getProviderBaseUrl(), adminSecret);
      await client.deleteSite(siteId);
      return siteId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sites() });
    },
  });
}

export function useRegenerateSecret() {
  const queryClient = useQueryClient();
  const { activeProviderId, adminSecret } = useAuthStore();

  return useMutation({
    mutationFn: async (siteId: string) => {
      if (!activeProviderId || !adminSecret) throw new Error('No active provider');
      const client = createSitesClientForProvider(getProviderBaseUrl(), adminSecret);
      const { site } = await client.regenerateSecret(siteId);
      return site;
    },
    onSuccess: (_data, siteId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sites() });
      queryClient.invalidateQueries({ queryKey: queryKeys.site(siteId) });
    },
  });
}
