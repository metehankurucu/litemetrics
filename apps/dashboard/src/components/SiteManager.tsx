import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createSitesClient, type Site } from '@litemetrics/client';
import { queryKeys } from '../hooks/useAnalytics';
import { useAuth } from '../auth';

type Platform = 'html' | 'react' | 'react-native' | 'nextjs' | 'node';

const PLATFORMS: { key: Platform; label: string }[] = [
  { key: 'html', label: 'HTML' },
  { key: 'react', label: 'React' },
  { key: 'react-native', label: 'React Native' },
  { key: 'nextjs', label: 'Next.js' },
  { key: 'node', label: 'Node.js' },
];

function getSetupSnippet(platform: Platform, siteId: string, secretKey: string, serverUrl: string): string {
  switch (platform) {
    case 'html':
      return `<!-- Add before </head> or </body> -->
<script src="${serverUrl}/litemetrics.js"></script>
<script>
  Litemetrics.createTracker({
    siteId: '${siteId}',
    endpoint: '${serverUrl}/api/collect',
  });
</script>`;
    case 'react':
      return `// 1. Install: bun add @litemetrics/react

import { LitemetricsProvider } from '@litemetrics/react';

function App() {
  return (
    <LitemetricsProvider
      siteId="${siteId}"
      endpoint="${serverUrl}/api/collect"
    >
      <YourApp />
    </LitemetricsProvider>
  );
}

// Track custom events:
import { useTrackEvent } from '@litemetrics/react';

function SignupButton() {
  const track = useTrackEvent();
  return (
    <button onClick={() => track('Signup', { plan: 'pro' })}>
      Sign Up
    </button>
  );
}`;
    case 'react-native':
      return `// 1. Install: bun add @litemetrics/react-native

import { LitemetricsProvider } from '@litemetrics/react-native';

function App() {
  return (
    <LitemetricsProvider
      siteId="${siteId}"
      endpoint="${serverUrl}/api/collect"
    >
      <YourApp />
    </LitemetricsProvider>
  );
}

// With React Navigation (auto screen tracking):
import { useNavigationTracking } from '@litemetrics/react-native';

function AppNavigator() {
  const navigationRef = useNavigationTracking();
  return <NavigationContainer ref={navigationRef}>...</NavigationContainer>;
}`;
    case 'nextjs':
      return `// 1. Install: bun add @litemetrics/react

// app/providers.tsx (App Router)
'use client';
import { LitemetricsProvider } from '@litemetrics/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LitemetricsProvider
      siteId="${siteId}"
      endpoint="${serverUrl}/api/collect"
    >
      {children}
    </LitemetricsProvider>
  );
}

// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({ children }) {
  return (
    <html><body>
      <Providers>{children}</Providers>
    </body></html>
  );
}`;
    case 'node':
      return `// Read analytics data from your backend
// Install: bun add @litemetrics/client

import { createClient } from '@litemetrics/client';

const client = createClient({
  baseUrl: '${serverUrl}',
  siteId: '${siteId}',
  secretKey: '${secretKey}',
});

// Get stats
const pageviews = await client.getStats({ metric: 'pageviews', period: '7d' });
const visitors = await client.getStats({ metric: 'visitors', period: '30d' });
const topPages = await client.getStats({ metric: 'top_pages', period: '7d', limit: 10 });

// Get time series
const timeseries = await client.getTimeSeries({
  metric: 'pageviews',
  period: '30d',
  granularity: 'day',
});`;
  }
}

export function SiteManager() {
  const { adminSecret } = useAuth();
  const queryClient = useQueryClient();
  const sitesClient = useMemo(() => createSitesClient({
    baseUrl: import.meta.env.VITE_LITEMETRICS_URL || '',
    adminSecret: adminSecret || '',
  }), [adminSecret]);

  const [selected, setSelected] = useState<Site | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editName, setEditName] = useState(selected?.name ?? '');

  useEffect(() => { setEditName(selected?.name ?? ''); }, [selected?.siteId]);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDomain, setNewDomain] = useState('');

  const { data: sites = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.sites(),
    queryFn: async () => {
      const { sites } = await sitesClient.listSites();
      return sites;
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, domain }: { name: string; domain?: string }) => {
      const { site } = await sitesClient.createSite({ name, domain });
      return site;
    },
    onSuccess: (site) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sites() });
      setShowCreate(false);
      setNewName('');
      setNewDomain('');
      setSelected(site);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create site');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (siteId: string) => {
      await sitesClient.deleteSite(siteId);
      return siteId;
    },
    onSuccess: (siteId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sites() });
      if (selected?.siteId === siteId) setSelected(null);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to delete site');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ siteId, data }: { siteId: string; data: { name?: string; allowedOrigins?: string[]; conversionEvents?: string[] } }) => {
      const { site } = await sitesClient.updateSite(siteId, data);
      return site;
    },
    onSuccess: (site) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sites() });
      setSelected(site);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to update site');
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (siteId: string) => {
      const { site } = await sitesClient.regenerateSecret(siteId);
      return site;
    },
    onSuccess: (site) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sites() });
      setSelected(site);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to regenerate secret');
    },
  });

  const handleCreate = () => {
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim(), domain: newDomain.trim() || undefined });
  };

  const handleDelete = (siteId: string) => {
    if (!confirm('Are you sure you want to delete this site?')) return;
    deleteMutation.mutate(siteId);
  };

  const handleRegenerate = (siteId: string) => {
    if (!confirm('Regenerate secret key? The old key will stop working immediately.')) return;
    regenerateMutation.mutate(siteId);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Error */}
      {error && (
        <div className="lg:col-span-3 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Site List */}
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Sites</h3>
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs font-semibold bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white px-3 py-1.5 rounded-lg shadow-sm transition-all"
          >
            + New Site
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg space-y-2 border border-zinc-200 dark:border-zinc-700">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Site name"
              autoFocus
              className="w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm dark:text-zinc-200"
            />
            <input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="Domain (optional)"
              className="w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm dark:text-zinc-200"
            />
            <div className="flex gap-2">
              <button onClick={handleCreate} className="text-xs font-medium bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white px-3 py-1.5 rounded-lg shadow-sm transition-all">
                Create
              </button>
              <button onClick={() => { setShowCreate(false); setNewName(''); setNewDomain(''); }} className="text-xs text-zinc-500 hover:text-zinc-700 px-3 py-1.5">
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <p className="text-zinc-400 text-sm py-4 text-center">No sites yet</p>
        ) : (
          <div className="space-y-1">
            {sites.map((site) => (
              <button
                key={site.siteId}
                onClick={() => setSelected(site)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selected?.siteId === site.siteId
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20'
                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-transparent'
                }`}
              >
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{site.name}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 font-mono">{site.siteId}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Site Detail */}
      <div className="lg:col-span-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-6">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-zinc-400 text-sm py-16">
            Select a site to view details
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => {
                  const trimmed = editName.trim();
                  if (!trimmed || trimmed === selected.name) {
                    setEditName(selected.name);
                    return;
                  }
                  updateMutation.mutate({ siteId: selected.siteId, data: { name: trimmed } });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  } else if (e.key === 'Escape') {
                    setEditName(selected.name);
                    e.currentTarget.blur();
                  }
                }}
                className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 bg-transparent border-b border-transparent hover:border-zinc-300 dark:hover:border-zinc-600 focus:border-indigo-500 dark:focus:border-indigo-400 outline-none px-0 py-0.5 transition-colors w-auto min-w-0"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleRegenerate(selected.siteId)}
                  className="text-xs text-amber-600 hover:text-amber-700 border border-amber-200 hover:border-amber-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Regenerate Secret
                </button>
                <button
                  onClick={() => handleDelete(selected.siteId)}
                  className="text-xs text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <Field label="Site ID" value={selected.siteId} onCopy={copyToClipboard} mono />
              <Field label="Secret Key" value={selected.secretKey} onCopy={copyToClipboard} mono secret />
              {selected.domain && <Field label="Domain" value={selected.domain} />}
              <Field label="Created" value={new Date(selected.createdAt).toLocaleString()} />
              <Field label="Updated" value={new Date(selected.updatedAt).toLocaleString()} />
            </div>

            {/* Allowed Hostnames */}
            <AllowedHostnames
              hostnames={selected.allowedOrigins ?? []}
              onUpdate={(hostnames) => updateMutation.mutate({ siteId: selected.siteId, data: { allowedOrigins: hostnames } })}
              saving={updateMutation.isPending}
            />

            {/* Conversion Events */}
            <ConversionEvents
              events={selected.conversionEvents ?? []}
              onUpdate={(events) => updateMutation.mutate({ siteId: selected.siteId, data: { conversionEvents: events } })}
              saving={updateMutation.isPending}
            />

            {/* Setup Guide */}
            <SetupGuide site={selected} />
          </div>
        )}
      </div>
    </div>
  );
}

function AllowedHostnames({ hostnames, onUpdate, saving }: {
  hostnames: string[];
  onUpdate: (hostnames: string[]) => void;
  saving: boolean;
}) {
  const [input, setInput] = useState('');

  const handleAdd = () => {
    const val = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!val || hostnames.includes(val)) return;
    onUpdate([...hostnames, val]);
    setInput('');
  };

  const handleRemove = (hostname: string) => {
    onUpdate(hostnames.filter((h) => h !== hostname));
  };

  return (
    <div>
      <p className="text-xs text-zinc-400 mb-2">Allowed Hostnames</p>
      <div className="flex flex-wrap gap-2 mb-2">
        {hostnames.map((h) => (
          <span key={h} className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1 text-sm font-mono text-zinc-700 dark:text-zinc-300">
            {h}
            <button
              onClick={() => handleRemove(h)}
              className="text-zinc-400 hover:text-red-500 transition-colors ml-0.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        {hostnames.length === 0 && (
          <span className="text-xs text-zinc-400 italic">All hostnames allowed</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="example.com"
          className="flex-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm font-mono dark:text-zinc-200"
        />
        <button
          onClick={handleAdd}
          disabled={saving}
          className="text-xs font-medium bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 disabled:from-indigo-400 disabled:to-indigo-400 text-white px-3 py-1.5 rounded-lg shadow-sm transition-all"
        >
          {saving ? 'Saving...' : 'Add'}
        </button>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5">Only events from these hostnames will be recorded. Leave empty to allow all.</p>
    </div>
  );
}

function ConversionEvents({ events, onUpdate, saving }: {
  events: string[];
  onUpdate: (events: string[]) => void;
  saving: boolean;
}) {
  const [input, setInput] = useState('');

  const handleAdd = () => {
    const val = input.trim();
    if (!val || events.includes(val)) return;
    onUpdate([...events, val]);
    setInput('');
  };

  const handleRemove = (name: string) => {
    onUpdate(events.filter((e) => e !== name));
  };

  return (
    <div>
      <p className="text-xs text-zinc-400 mb-2">Conversion Events</p>
      <div className="flex flex-wrap gap-2 mb-2">
        {events.map((e) => (
          <span key={e} className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg px-2.5 py-1 text-sm font-mono text-emerald-700 dark:text-emerald-400">
            {e}
            <button
              onClick={() => handleRemove(e)}
              className="text-emerald-400 hover:text-red-500 transition-colors ml-0.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        {events.length === 0 && (
          <span className="text-xs text-zinc-400 italic">No conversions configured</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Signup"
          className="flex-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm font-mono dark:text-zinc-200"
        />
        <button
          onClick={handleAdd}
          disabled={saving}
          className="text-xs font-medium bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:from-emerald-400 disabled:to-emerald-400 text-white px-3 py-1.5 rounded-lg shadow-sm transition-all"
        >
          {saving ? 'Saving...' : 'Add'}
        </button>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5">Events with these exact names count as conversions.</p>
    </div>
  );
}

function SetupGuide({ site }: { site: Site }) {
  const [platform, setPlatform] = useState<Platform>('html');
  const [copied, setCopied] = useState(false);
  const [autoUrl, setAutoUrl] = useState(true);
  const [customUrl, setCustomUrl] = useState('https://');
  const serverUrl = autoUrl ? window.location.origin : customUrl.replace(/\/+$/, '');
  const snippet = getSetupSnippet(platform, site.siteId, site.secretKey, serverUrl);

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Setup Guide</h3>
        <div className="flex gap-1">
          {PLATFORMS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPlatform(p.key)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                platform === p.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-zinc-400 dark:text-zinc-500">Server URL:</span>
        <button
          onClick={() => setAutoUrl(!autoUrl)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoUrl ? 'bg-indigo-600' : 'bg-zinc-300'}`}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${autoUrl ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
        </button>
        {autoUrl ? (
          <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">{window.location.origin}</span>
        ) : (
          <input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="https://your-server.com"
            className="flex-1 text-xs font-mono bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-2 py-1 dark:text-zinc-200"
          />
        )}
      </div>
      <div className="relative">
        <pre className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 text-xs text-zinc-700 dark:text-zinc-300 overflow-x-auto whitespace-pre-wrap">
          {snippet}
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 text-xs bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 hover:border-zinc-300 dark:hover:border-zinc-500 text-zinc-500 dark:text-zinc-300 hover:text-zinc-700 dark:hover:text-zinc-100 px-2 py-1 rounded transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onCopy, mono, secret }: {
  label: string;
  value: string;
  onCopy?: (v: string) => void;
  mono?: boolean;
  secret?: boolean;
}) {
  const [revealed, setRevealed] = useState(!secret);

  return (
    <div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <p className={`text-sm text-zinc-800 dark:text-zinc-200 ${mono ? 'font-mono' : ''} ${secret && !revealed ? 'select-none' : ''} break-all`}>
          {secret && !revealed ? value.slice(0, 6) + '...' + value.slice(-4) : value}
        </p>
        {secret && (
          <button
            onClick={() => setRevealed(!revealed)}
            className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        )}
        {onCopy && (
          <button
            onClick={() => onCopy(value)}
            className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            Copy
          </button>
        )}
      </div>
    </div>
  );
}
