import { useEffect, useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSitesClient, type Site } from '@litemetrics/client';
import { Globe, Smartphone, Plus } from 'lucide-react';
import { useAuth } from '../auth';
import { queryKeys } from '../hooks/useAnalytics';
import { useCommandPalette } from '../hooks/useCommandPalette';

interface CommandPaletteProps {
  /** Currently selected site id, used to highlight the active row. */
  siteId: string;
  /** Called when the user picks a site (or creates one and we auto-select it). */
  onSiteChange: (siteId: string) => void;
}

type Screen = 'list' | 'create';

export function CommandPalette({ siteId, onSiteChange }: CommandPaletteProps) {
  const { open, setOpen, toggle } = useCommandPalette();
  const { adminSecret } = useAuth();
  const queryClient = useQueryClient();

  const [screen, setScreen] = useState<Screen>('list');
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sitesClient = useMemo(
    () =>
      createSitesClient({
        baseUrl: import.meta.env.VITE_LITEMETRICS_URL || '',
        adminSecret: adminSecret || '',
      }),
    [adminSecret]
  );

  // Cmd+K / Ctrl+K toggle, Esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen, toggle]);

  // Reset transient state whenever palette closes.
  useEffect(() => {
    if (!open) {
      setScreen('list');
      setSearch('');
      setNewName('');
      setNewDomain('');
      setError(null);
    }
  }, [open]);

  const { data: sites = [], isLoading } = useQuery({
    queryKey: queryKeys.sites(),
    queryFn: async () => {
      const result = await sitesClient.listSites();
      return result.sites;
    },
    enabled: open && !!adminSecret,
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, domain }: { name: string; domain?: string }) => {
      const { site } = await sitesClient.createSite({ name, domain });
      return site;
    },
    onSuccess: (site) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sites() });
      onSiteChange(site.siteId);
      setOpen(false);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create site');
    },
  });

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setError(null);
    createMutation.mutate({ name: trimmed, domain: newDomain.trim() || undefined });
  };

  const handleSelectSite = (site: Site) => {
    onSiteChange(site.siteId);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="mx-auto mt-[20vh] max-w-2xl rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          label="Command palette"
          shouldFilter={screen === 'list'}
          className="flex flex-col"
        >
          {screen === 'list' ? (
            <>
              <div className="border-b border-zinc-200/60 dark:border-zinc-800 px-4">
                <Command.Input
                  autoFocus
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Search sites..."
                  className="w-full bg-transparent py-3.5 text-sm text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 border-0 focus:border-0 shadow-none"
                />
              </div>
              <Command.List className="max-h-[60vh] overflow-y-auto p-2">
                {isLoading ? (
                  <div className="px-3 py-6 text-center text-sm text-zinc-400">Loading sites...</div>
                ) : (
                  <Command.Empty className="px-3 py-6 text-center text-sm text-zinc-400">
                    No sites found.
                  </Command.Empty>
                )}

                {sites.length > 0 && (
                  <Command.Group
                    heading="Sites"
                    className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 px-2 py-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-zinc-400 [&_[cmdk-group-heading]]:dark:text-zinc-500"
                  >
                    {sites.map((site) => (
                      <Command.Item
                        key={site.siteId}
                        value={`${site.name} ${site.siteId}`}
                        onSelect={() => handleSelectSite(site)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800 ${
                          site.siteId === siteId
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : 'text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {site.type === 'app' ? (
                          <Smartphone className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                        ) : (
                          <Globe className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        )}
                        <span className="truncate flex-1">{site.name}</span>
                        <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                          {site.siteId}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                <Command.Separator className="my-2 h-px bg-zinc-200/60 dark:bg-zinc-800" />

                <Command.Group>
                  <Command.Item
                    value="new-site create-site add-site"
                    onSelect={() => setScreen('create')}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer text-zinc-700 dark:text-zinc-300 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800"
                  >
                    <Plus className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <span>New site</span>
                  </Command.Item>
                </Command.Group>
              </Command.List>
            </>
          ) : (
            <div className="p-4 space-y-3">
              <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                Create a new site
              </div>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Site name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
                className="w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm dark:text-zinc-200 outline-none focus:border-indigo-500 dark:focus:border-indigo-400"
              />
              <input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="Domain (optional)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
                className="w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm dark:text-zinc-200 outline-none focus:border-indigo-500 dark:focus:border-indigo-400"
              />
              {error && (
                <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={() => {
                    setScreen('list');
                    setNewName('');
                    setNewDomain('');
                    setError(null);
                  }}
                  className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || createMutation.isPending}
                  className="text-xs font-semibold bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 disabled:from-indigo-400 disabled:to-indigo-400 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg shadow-sm transition-all"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          )}
        </Command>
      </div>
    </div>
  );
}
