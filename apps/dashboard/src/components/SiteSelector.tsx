import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createSitesClient, type Site } from '@litemetrics/client';
import { queryKeys } from '../hooks/useAnalytics';
import { useAuth } from '../auth';

interface SiteSelectorProps {
  siteId: string;
  onChange: (siteId: string) => void;
}

export function SiteSelector({ siteId, onChange }: SiteSelectorProps) {
  const { adminSecret } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentSite = sites.find((s) => s.siteId === siteId);

  if (sites.length === 0) {
    return (
      <button
        onClick={() => {
          const id = prompt('Enter Site ID:', siteId);
          if (id?.trim()) onChange(id.trim());
        }}
        className="w-full flex items-center gap-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
        <span className="truncate">{siteId}</span>
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
        <span className="truncate">{currentSite?.name || siteId}</span>
        <svg className="w-3 h-3 text-zinc-400 ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
          {sites.map((site) => (
            <button
              key={site.siteId}
              onClick={() => { onChange(site.siteId); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors ${
                site.siteId === siteId ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-700 dark:text-zinc-300'
              }`}
            >
              <p className="truncate">{site.name}</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">{site.siteId}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
