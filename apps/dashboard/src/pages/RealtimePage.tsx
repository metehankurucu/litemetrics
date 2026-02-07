import { useQuery } from '@tanstack/react-query';
import type { LitemetricsClient } from '@litemetrics/client';
import { queryKeys } from '../hooks/useAnalytics';
import { getBrowserIcon, getDeviceIcon } from '../components/icons';

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
      <div className="rounded-xl bg-white border border-zinc-200 p-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </span>
          <span className="text-sm font-medium text-green-600 uppercase tracking-wide">Live</span>
        </div>
        {loading ? (
          <div className="h-16 w-32 mx-auto bg-zinc-100 rounded-lg animate-pulse" />
        ) : (
          <>
            <p className="text-6xl font-bold tabular-nums text-zinc-900">{activeVisitors}</p>
            <p className="text-sm text-zinc-500 mt-1">active visitor{activeVisitors !== 1 ? 's' : ''} in the last hour</p>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active pages */}
        <div className="rounded-xl bg-white border border-zinc-200 p-5">
          <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-4">Active Pages</h3>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-7 bg-zinc-50 rounded animate-pulse" />
              ))}
            </div>
          ) : activePages.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-8">No active pages</p>
          ) : (
            <div className="space-y-1.5">
              {activePages.map((page) => (
                <div key={page.url} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-zinc-50 transition-colors">
                  <span className="text-sm text-zinc-700 truncate mr-3">{page.url || '/'}</span>
                  <span className="text-sm text-zinc-500 tabular-nums flex-shrink-0">{page.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent events feed */}
        <div className="rounded-xl bg-white border border-zinc-200 p-5">
          <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-4">Recent Events</h3>
          {loading ? (
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-7 bg-zinc-50 rounded animate-pulse" />
              ))}
            </div>
          ) : recentEvents.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-8">No recent events</p>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {recentEvents.map((event) => {
                const time = new Date(event.timestamp);
                const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const typeBadge = {
                  pageview: { label: 'PV', color: 'bg-blue-100 text-blue-700' },
                  event: { label: 'EV', color: 'bg-purple-100 text-purple-700' },
                  identify: { label: 'ID', color: 'bg-green-100 text-green-700' },
                };
                const badge = typeBadge[event.type];
                let detail = '';
                if (event.type === 'pageview') {
                  try { detail = new URL(event.url || '').pathname; } catch { detail = event.url || ''; }
                } else if (event.type === 'event') {
                  detail = event.name || '';
                }

                return (
                  <div key={event.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-50 transition-colors text-sm">
                    <span className="text-xs text-zinc-400 tabular-nums w-16 flex-shrink-0">{timeStr}</span>
                    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-full ${badge.color}`}>
                      {badge.label}
                    </span>
                    {event.device && (
                      <span className="flex-shrink-0">{getBrowserIcon(event.device.browser)}</span>
                    )}
                    {event.device && (
                      <span className="flex-shrink-0">{getDeviceIcon(event.device.type)}</span>
                    )}
                    <span className="text-zinc-600 truncate">{detail || '—'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
