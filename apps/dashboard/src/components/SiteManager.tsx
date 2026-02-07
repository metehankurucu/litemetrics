import { useState, useEffect, useCallback, useMemo } from 'react';
import { createSitesClient, type Site } from '@insayt/client';
import { useAuth } from '../auth';

export function SiteManager() {
  const { adminSecret } = useAuth();
  const sitesClient = useMemo(() => createSitesClient({
    baseUrl: import.meta.env.VITE_INSAYT_URL || '',
    adminSecret: adminSecret || '',
  }), [adminSecret]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selected, setSelected] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDomain, setNewDomain] = useState('');

  const fetchSites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { sites } = await sitesClient.listSites();
      setSites(sites);
      if (selected) {
        const updated = sites.find((s) => s.siteId === selected.siteId);
        setSelected(updated ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sites');
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => { fetchSites(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const { site } = await sitesClient.createSite({
        name: newName.trim(),
        domain: newDomain.trim() || undefined,
      });
      setShowCreate(false);
      setNewName('');
      setNewDomain('');
      setSites((prev) => [site, ...prev]);
      setSelected(site);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create site');
    }
  };

  const handleDelete = async (siteId: string) => {
    if (!confirm('Are you sure you want to delete this site?')) return;
    try {
      await sitesClient.deleteSite(siteId);
      setSites((prev) => prev.filter((s) => s.siteId !== siteId));
      if (selected?.siteId === siteId) setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete site');
    }
  };

  const handleRegenerate = async (siteId: string) => {
    if (!confirm('Regenerate secret key? The old key will stop working immediately.')) return;
    try {
      const { site } = await sitesClient.regenerateSecret(siteId);
      setSites((prev) => prev.map((s) => (s.siteId === siteId ? site : s)));
      setSelected(site);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate secret');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Error */}
      {error && (
        <div className="lg:col-span-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Site List */}
      <div className="rounded-xl bg-white border border-zinc-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-zinc-500">Sites</h3>
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            + New Site
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="mb-4 p-3 bg-zinc-50 rounded-lg space-y-2 border border-zinc-200">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Site name"
              autoFocus
              className="w-full bg-white border border-zinc-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            />
            <input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="Domain (optional)"
              className="w-full bg-white border border-zinc-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            />
            <div className="flex gap-2">
              <button onClick={handleCreate} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded transition-colors">
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
              <div key={i} className="h-12 bg-zinc-100 rounded-lg animate-pulse" />
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
                    ? 'bg-indigo-50 border border-indigo-200'
                    : 'hover:bg-zinc-50 border border-transparent'
                }`}
              >
                <p className="text-sm font-medium text-zinc-800 truncate">{site.name}</p>
                <p className="text-xs text-zinc-400 mt-0.5 font-mono">{site.siteId}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Site Detail */}
      <div className="lg:col-span-2 rounded-xl bg-white border border-zinc-200 p-6">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-zinc-400 text-sm py-16">
            Select a site to view details
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">{selected.name}</h2>
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

            {/* Integration snippet */}
            <div>
              <h3 className="text-sm font-medium text-zinc-500 mb-2">Tracker Integration</h3>
              <pre className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 text-xs text-zinc-700 overflow-x-auto">
{`<script src="YOUR_SERVER/insayt.js"></script>
<script>
  Insayt.init({
    siteId: '${selected.siteId}',
    endpoint: 'YOUR_SERVER/api/collect',
  });
</script>`}
              </pre>
            </div>

            <div>
              <h3 className="text-sm font-medium text-zinc-500 mb-2">Client SDK</h3>
              <pre className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 text-xs text-zinc-700 overflow-x-auto">
{`import { createClient } from '@insayt/client';

const client = createClient({
  baseUrl: 'YOUR_SERVER',
  siteId: '${selected.siteId}',
  secretKey: '${selected.secretKey}',
});

const stats = await client.getPageviews({ period: '7d' });`}
              </pre>
            </div>
          </div>
        )}
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
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <p className={`text-sm text-zinc-800 ${mono ? 'font-mono' : ''} ${secret && !revealed ? 'select-none' : ''} break-all`}>
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
