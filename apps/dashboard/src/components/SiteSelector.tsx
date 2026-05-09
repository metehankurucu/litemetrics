import { useQuery } from '@tanstack/react-query';
import { createSitesClient } from '@litemetrics/client';
import { queryKeys } from '../hooks/useAnalytics';
import { useAuth } from '../auth';
import { useCommandPalette } from '../hooks/useCommandPalette';

interface SiteSelectorProps {
  siteId: string;
  onChange: (siteId: string) => void;
}

export function SiteSelector({ siteId }: SiteSelectorProps) {
  const { adminSecret } = useAuth();
  const { setOpen } = useCommandPalette();

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

  const currentSite = sites.find((s) => s.siteId === siteId);
  const currentName = currentSite?.name ?? (siteId || 'No site selected');
  const isMac =
    typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

  return (
    <button
      onClick={() => setOpen(true)}
      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 text-sm dark:text-zinc-200 bg-white dark:bg-zinc-800 transition-colors"
    >
      <span className="truncate font-medium">{currentName}</span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono whitespace-nowrap">
        {isMac ? '⌘K' : 'Ctrl K'}
      </span>
    </button>
  );
}
