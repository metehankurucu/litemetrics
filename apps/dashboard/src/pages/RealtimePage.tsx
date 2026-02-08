import { useQuery } from '@tanstack/react-query';
import type { LitemetricsClient } from '@litemetrics/client';
import { queryKeys } from '../hooks/useAnalytics';
import { getBrowserIcon, getDeviceIcon } from '../components/icons';
import { WorldMap } from '../components/WorldMap';

interface RealtimePageProps {
  siteId: string;
  client: LitemetricsClient;
}

export function RealtimePage({ siteId, client }: RealtimePageProps) {
  const { data, isLoading: loading } = useQuery({
    queryKey: queryKeys.realtime(siteId),
    queryFn: async () => {
      client.setSiteId(siteId);
      const [visitorsResult, eventsResult, pagesResult] = await Promise.all([
        client.getStats('visitors', { period: '1h' }),
        client.getEventsList({ period: '1h', limit: 30 }),
        client.getStats('top_pages', { period: '1h', limit: 10 }),
      ]);

      return {
        activeVisitors: visitorsResult.total,
        recentEvents: eventsResult.events,
        activePages: pagesResult.data.map((d) => ({ url: d.key, count: d.value })),
      };
    },
    refetchInterval: 10_000,
  });

  const activeVisitors = data?.activeVisitors ?? 0;
  const recentEvents = data?.recentEvents ?? [];
  const activePages = data?.activePages ?? [];

  return (
    <div className="space-y-6">
      {/* Active visitors big number */}
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-5 md:p-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </span>
          <span className="text-sm font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">Live</span>
        </div>
        {loading ? (
          <div className="h-16 w-32 mx-auto bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
        ) : (
          <>
            <p className="text-4xl md:text-6xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{activeVisitors}</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">active visitor{activeVisitors !== 1 ? 's' : ''} in the last hour</p>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active pages */}
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-5 h-full">
          <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-4">Active Pages</h3>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-7 bg-zinc-50 dark:bg-zinc-800 rounded animate-pulse" />
              ))}
            </div>
          ) : activePages.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-8">No active pages</p>
          ) : (
            <div className="space-y-1.5">
              {activePages.map((page) => (
                <div key={page.url} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate mr-3">{page.url || '/'}</span>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400 tabular-nums flex-shrink-0">{page.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent events feed */}
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-5 h-full">
          <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-4">Recent Events</h3>
          {loading ? (
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-7 bg-zinc-50 dark:bg-zinc-800 rounded animate-pulse" />
              ))}
            </div>
          ) : recentEvents.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-8">No recent events</p>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {recentEvents.map((event) => {
                const time = new Date(event.timestamp);
                const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const typeBadge = {
                  pageview: { label: 'PV', color: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400' },
                  event: { label: 'EV', color: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400' },
                  identify: { label: 'ID', color: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400' },
                };
                const badge = typeBadge[event.type];
                let detail = '';
                if (event.type === 'pageview') {
                  try { detail = new URL(event.url || '').pathname; } catch { detail = event.url || ''; }
                } else if (event.type === 'event') {
                  detail = event.name || '';
                }

                return (
                  <div key={event.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-sm">
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 tabular-nums w-16 flex-shrink-0">{timeStr}</span>
                    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-full ${badge.color}`}>
                      {badge.label}
                    </span>
                    {event.device && (
                      <span className="flex-shrink-0">{getBrowserIcon(event.device.browser)}</span>
                    )}
                    {event.device && (
                      <span className="flex-shrink-0">{getDeviceIcon(event.device.type)}</span>
                    )}
                    <span className="text-zinc-600 dark:text-zinc-400 truncate">{detail || '—'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <WorldMap client={client} siteId={siteId} period="1h" />
    </div>
  );
}
