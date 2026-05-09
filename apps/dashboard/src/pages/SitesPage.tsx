import { useQuery } from '@tanstack/react-query';
import { createSitesClient } from '@litemetrics/client';
import { useAuth } from '../auth';
import { queryKeys } from '../hooks/useAnalytics';
import { SiteManager } from '../components/SiteManager';

interface SitesPageProps {
  siteId: string;
}

export function SitesPage({ siteId }: SitesPageProps) {
  const { adminSecret } = useAuth();

  const { data: sites = [] } = useQuery({
    queryKey: queryKeys.sites(),
    queryFn: async () => {
      const client = createSitesClient({
        baseUrl: import.meta.env.VITE_LITEMETRICS_URL || '',
        adminSecret: adminSecret!,
      });
      const result = await client.listSites();
      return result.sites;
    },
    enabled: !!adminSecret,
  });

  const site = sites.find((s) => s.siteId === siteId) ?? null;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6 text-zinc-900 dark:text-zinc-100">Site Settings</h1>
      <SiteManager site={site} />
    </div>
  );
}
