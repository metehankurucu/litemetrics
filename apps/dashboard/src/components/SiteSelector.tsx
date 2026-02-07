import { useState, useEffect, useRef } from 'react';
import { createSitesClient, type Site } from '@litemetrics/client';
import { useAuth } from '../auth';

interface SiteSelectorProps {
  siteId: string;
  onChange: (siteId: string) => void;
}

export function SiteSelector({ siteId, onChange }: SiteSelectorProps) {
  const { adminSecret } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!adminSecret) return;
    const client = createSitesClient({
      baseUrl: import.meta.env.VITE_LITEMETRICS_URL || '',
      adminSecret,
    });
    client.listSites().then(({ sites }) => setSites(sites)).catch(() => {});
  }, [adminSecret]);

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
        className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-3 py-1.5 text-sm hover:border-zinc-300 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        {siteId}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-3 py-1.5 text-sm hover:border-zinc-300 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        {currentSite?.name || siteId}
        <svg className="w-3 h-3 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 w-56 bg-white border border-zinc-200 rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
          {sites.map((site) => (
            <button
              key={site.siteId}
              onClick={() => { onChange(site.siteId); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 transition-colors ${
                site.siteId === siteId ? 'text-indigo-600' : 'text-zinc-700'
              }`}
            >
              <p className="truncate">{site.name}</p>
              <p className="text-xs text-zinc-400 font-mono">{site.siteId}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
