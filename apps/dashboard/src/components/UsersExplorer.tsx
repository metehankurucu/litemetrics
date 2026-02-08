import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LitemetricsClient, UserDetail, EventListItem } from '@litemetrics/client';
import { queryKeys } from '../hooks/useAnalytics';
import { getBrowserIcon, getOSIcon, getDeviceIcon } from './icons';
import { ExportButton } from './ExportButton';
import { Activity, Eye, Layers, Calendar, User, Monitor, Tag, Clock, Smartphone } from 'lucide-react';

interface UsersExplorerProps {
  siteId: string;
  client: LitemetricsClient;
  initialVisitorId?: string | null;
  onBack?: () => void;
}

export function UsersExplorer({ siteId, client, initialVisitorId, onBack }: UsersExplorerProps) {
  const [selectedVisitorId, setSelectedVisitorId] = useState<string | null>(initialVisitorId ?? null);

  // If initialVisitorId changes, update
  useEffect(() => {
    if (initialVisitorId) setSelectedVisitorId(initialVisitorId);
  }, [initialVisitorId]);

  if (selectedVisitorId) {
    return (
      <UserDetailView
        siteId={siteId}
        client={client}
        visitorId={selectedVisitorId}
        onBack={() => {
          setSelectedVisitorId(null);
          onBack?.();
        }}
      />
    );
  }

  return <UsersList siteId={siteId} client={client} onSelect={setSelectedVisitorId} />;
}

// ─── Users List ───────────────────────────────────────────

function UsersList({ siteId, client, onSelect }: { siteId: string; client: LitemetricsClient; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const limit = 30;

  const { data, isLoading: loading, error } = useQuery({
    queryKey: queryKeys.users(siteId, { search, page }),
    queryFn: async () => {
      client.setSiteId(siteId);
      const result = await client.getUsers({
        search: search || undefined,
        limit,
        offset: page * limit,
      });
      return { users: result.users, total: result.total };
    },
    placeholderData: (prev) => prev,
  });

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const handleSearchChange = (v: string) => { setSearch(v); setPage(0); };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search by visitor ID or user ID..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm dark:text-zinc-200 w-80"
        />
        <span className="text-sm text-zinc-400 ml-auto">
          {total.toLocaleString()} user{total !== 1 ? 's' : ''}
        </span>
        <ExportButton
          data={users.map((u) => ({
            visitorId: u.visitorId,
            userId: u.userId ?? '',
            totalEvents: u.totalEvents,
            totalPageviews: u.totalPageviews,
            totalSessions: u.totalSessions,
            firstSeen: u.firstSeen,
            lastSeen: u.lastSeen,
            country: u.geo?.country ?? '',
            city: u.geo?.city ?? '',
          }))}
          filename={`users-${siteId}`}
        />
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
          {error instanceof Error ? error.message : 'Failed to fetch users'}
        </div>
      )}

      {/* Users table */}
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">User</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Events</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Pages</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Sessions</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Last Seen</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Location</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="border-b border-zinc-50 dark:border-zinc-800">
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-5 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-zinc-400 text-sm">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user) => {
                // Use userId as identifier for merged profiles, fallback to visitorId
                const identifier = user.userId || user.visitorId;
                const deviceCount = user.visitorIds?.length ?? 1;
                return (
                <tr
                  key={identifier}
                  className="border-b border-zinc-50 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
                  onClick={() => onSelect(identifier)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0"
                        style={{ backgroundColor: hashColor(identifier) }}
                      >
                        {(user.userId || user.visitorId).slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                          {user.userId || (
                            <span className="text-zinc-400 dark:text-zinc-500">Anonymous</span>
                          )}
                          {deviceCount > 1 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                              <Smartphone className="w-2.5 h-2.5" />
                              {deviceCount}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-400 dark:text-zinc-500 font-mono truncate max-w-[140px]">
                          {user.visitorId}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 tabular-nums">
                    {user.totalEvents.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 tabular-nums">
                    {user.totalPageviews.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 tabular-nums">
                    {user.totalSessions.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-zinc-500 dark:text-zinc-400">
                    {formatRelative(user.lastSeen)}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-zinc-500 dark:text-zinc-400">
                    {user.geo?.country ? (
                      <span>{countryToFlag(user.geo.country)} {[user.geo.city, user.geo.country].filter(Boolean).join(', ')}</span>
                    ) : '—'}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm font-medium border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow disabled:opacity-30 disabled:cursor-not-allowed transition-all text-zinc-700 dark:text-zinc-300"
          >
            Previous
          </button>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-sm font-medium border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow disabled:opacity-30 disabled:cursor-not-allowed transition-all text-zinc-700 dark:text-zinc-300"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ─── User Detail View ────────────────────────────────────

function UserDetailView({ siteId, client, visitorId: identifier, onBack }: { siteId: string; client: LitemetricsClient; visitorId: string; onBack: () => void }) {
  const [eventsPage, setEventsPage] = useState(0);
  const eventsLimit = 30;

  const { data: user, isLoading: loading, error } = useQuery({
    queryKey: queryKeys.userDetail(siteId, identifier),
    queryFn: async () => {
      client.setSiteId(siteId);
      return client.getUserDetail(identifier);
    },
  });

  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: queryKeys.userEvents(siteId, identifier, { page: eventsPage }),
    queryFn: async () => {
      client.setSiteId(siteId);
      const result = await client.getUserEvents(identifier, {
        limit: eventsLimit,
        offset: eventsPage * eventsLimit,
      });
      return { events: result.events, total: result.total };
    },
  });

  const events = eventsData?.events ?? [];
  const eventsTotal = eventsData?.total ?? 0;
  const eventsTotalPages = Math.ceil(eventsTotal / eventsLimit);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
        <div className="h-40 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300">
          &larr; Back to users
        </button>
        <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
          {error instanceof Error ? error.message : 'User not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button onClick={onBack} className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300">
          &larr; Back
        </button>
        <div className="mt-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {user.userId || 'Anonymous User'}
          </h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">{user.visitorId}</p>
        </div>
      </div>

      {/* User info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoCard label="Total Events" value={user.totalEvents.toLocaleString()} icon={<Activity className="w-3.5 h-3.5" />} />
        <InfoCard label="Pageviews" value={user.totalPageviews.toLocaleString()} icon={<Eye className="w-3.5 h-3.5" />} />
        <InfoCard label="Sessions" value={user.totalSessions.toLocaleString()} icon={<Layers className="w-3.5 h-3.5" />} />
        <InfoCard label="First Seen" value={formatRelative(user.firstSeen)} icon={<Calendar className="w-3.5 h-3.5" />} />
      </div>

      {/* User profile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Profile */}
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-5 h-full">
          <div className="flex items-center gap-1.5 mb-4">
            <span className="text-zinc-400 dark:text-zinc-500"><User className="w-3.5 h-3.5" /></span>
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Profile</h3>
          </div>
          <div className="space-y-3">
            {user.userId && <ProfileField label="User ID" value={user.userId} />}
            <ProfileField label="Visitor ID" value={user.visitorId} mono />
            {user.visitorIds && user.visitorIds.length > 1 && (
              <div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">Linked Devices ({user.visitorIds.length})</p>
                <div className="space-y-1">
                  {user.visitorIds.map((vid) => (
                    <p key={vid} className="text-xs text-zinc-500 dark:text-zinc-400 font-mono truncate">{vid}</p>
                  ))}
                </div>
              </div>
            )}
            <ProfileField label="First Seen" value={new Date(user.firstSeen).toLocaleString()} />
            <ProfileField label="Last Seen" value={new Date(user.lastSeen).toLocaleString()} />
            {user.lastUrl && <ProfileField label="Last Page" value={user.lastUrl} />}
            {user.referrer && <ProfileField label="Referrer" value={user.referrer} />}
          </div>
        </div>

        {/* Environment */}
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-5 h-full">
          <div className="flex items-center gap-1.5 mb-4">
            <span className="text-zinc-400 dark:text-zinc-500"><Monitor className="w-3.5 h-3.5" /></span>
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Environment</h3>
          </div>
          <div className="space-y-3">
            {user.device && (
              <div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">Device</p>
                <div className="flex items-center gap-3 text-sm text-zinc-800 dark:text-zinc-200 flex-wrap">
                  <span className="flex items-center gap-1">{getBrowserIcon(user.device.browser)} {user.device.browser}</span>
                  <span className="text-zinc-300 dark:text-zinc-600">|</span>
                  <span className="flex items-center gap-1">{getOSIcon(user.device.os)} {user.device.os}</span>
                  <span className="text-zinc-300 dark:text-zinc-600">|</span>
                  <span className="flex items-center gap-1">{getDeviceIcon(user.device.type)} {user.device.type}</span>
                </div>
              </div>
            )}
            {user.geo && (
              <ProfileField
                label="Location"
                value={[countryToFlag(user.geo.country || ''), user.geo.city, user.geo.region, user.geo.country].filter(Boolean).join(' ')}
              />
            )}
            {user.language && <ProfileField label="Language" value={user.language} />}
            {user.timezone && <ProfileField label="Timezone" value={user.timezone} />}
            {user.screen && <ProfileField label="Screen" value={`${user.screen.width} × ${user.screen.height}`} />}
          </div>
        </div>

        {/* Attribution + Traits */}
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-5 h-full">
          <div className="flex items-center gap-1.5 mb-4">
            <span className="text-zinc-400 dark:text-zinc-500"><Tag className="w-3.5 h-3.5" /></span>
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Attribution & Traits</h3>
          </div>
          <div className="space-y-3">
            {user.utm ? (
              <div className="space-y-2">
                {user.utm.source && <ProfileField label="UTM Source" value={user.utm.source} />}
                {user.utm.medium && <ProfileField label="UTM Medium" value={user.utm.medium} />}
                {user.utm.campaign && <ProfileField label="UTM Campaign" value={user.utm.campaign} />}
                {user.utm.term && <ProfileField label="UTM Term" value={user.utm.term} />}
                {user.utm.content && <ProfileField label="UTM Content" value={user.utm.content} />}
              </div>
            ) : (
              <p className="text-sm text-zinc-400 dark:text-zinc-500">No UTM data</p>
            )}
            {user.traits && Object.keys(user.traits).length > 0 ? (
              <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                {Object.entries(user.traits).map(([key, value]) => (
                  <ProfileField key={key} label={key} value={String(value)} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-400 dark:text-zinc-500">No traits set</p>
            )}
          </div>
        </div>
      </div>

      {/* Event timeline */}
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-5">
        <div className="flex items-center gap-1.5 mb-4">
          <span className="text-zinc-400 dark:text-zinc-500"><Clock className="w-3.5 h-3.5" /></span>
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Event Timeline
            <span className="text-zinc-400 dark:text-zinc-500 font-normal ml-2">({eventsTotal})</span>
          </h3>
        </div>

        {eventsLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No events</p>
        ) : (
          <div className="space-y-0">
            {events.map((event, i) => (
              <TimelineEvent key={event.id} event={event} isLast={i === events.length - 1} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {eventsTotalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              onClick={() => setEventsPage((p) => Math.max(0, p - 1))}
              disabled={eventsPage === 0}
              className="px-3 py-1.5 text-sm font-medium border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow disabled:opacity-30 disabled:cursor-not-allowed transition-all text-zinc-700 dark:text-zinc-300"
            >
              Previous
            </button>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Page {eventsPage + 1} of {eventsTotalPages}
            </span>
            <button
              onClick={() => setEventsPage((p) => Math.min(eventsTotalPages - 1, p + 1))}
              disabled={eventsPage >= eventsTotalPages - 1}
              className="px-3 py-1.5 text-sm font-medium border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow disabled:opacity-30 disabled:cursor-not-allowed transition-all text-zinc-700 dark:text-zinc-300"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared components ──────────────────────────────────

function InfoCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-zinc-400 dark:text-zinc-500">{icon}</span>}
        <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{value}</p>
    </div>
  );
}

function ProfileField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-0.5">{label}</p>
      <p className={`text-sm text-zinc-800 dark:text-zinc-200 break-all ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function TimelineEvent({ event, isLast }: { event: EventListItem; isLast: boolean }) {
  const time = new Date(event.timestamp);
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = time.toLocaleDateString([], { month: 'short', day: 'numeric' });

  const typeConfig = {
    pageview: { dot: 'bg-blue-500', label: 'Pageview' },
    event: { dot: 'bg-purple-500', label: 'Event' },
    identify: { dot: 'bg-green-500', label: 'Identify' },
  };

  const config = typeConfig[event.type];

  let detail = '';
  if (event.type === 'pageview') {
    try { detail = new URL(event.url || '').pathname; } catch { detail = event.url || ''; }
  } else if (event.type === 'event') {
    detail = event.name || '';
  } else if (event.type === 'identify') {
    detail = event.userId || '';
  }

  return (
    <div className="flex gap-3">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center w-4 flex-shrink-0">
        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${config.dot}`} />
        {!isLast && <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-700 my-1" />}
      </div>

      {/* Content */}
      <div className={`flex-1 pb-4 ${isLast ? '' : ''}`}>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{config.label}</span>
          {detail && (
            <span className="text-sm text-zinc-500 dark:text-zinc-400 truncate max-w-xs" title={detail}>{detail}</span>
          )}
          <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-auto flex-shrink-0">{dateStr} {timeStr}</span>
        </div>
        {event.properties && Object.keys(event.properties).length > 0 && (
          <div className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 rounded px-2 py-1 font-mono">
            {Object.entries(event.properties).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')}
          </div>
        )}
        {event.traits && Object.keys(event.traits).length > 0 && (
          <div className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 rounded px-2 py-1 font-mono">
            {Object.entries(event.traits).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}

function formatRelative(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#ef4444', '#f97316',
    '#eab308', '#22c55e', '#14b8a6', '#06b6d4',
    '#3b82f6', '#2563eb',
  ];
  return colors[Math.abs(hash) % colors.length];
}

function countryToFlag(code: string): string {
  if (code.length !== 2) return '';
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    ...Array.from(upper).map((c) => 0x1F1E6 + c.charCodeAt(0) - 65)
  );
}
