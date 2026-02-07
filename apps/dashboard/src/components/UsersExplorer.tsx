import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LitemetricsClient, UserDetail, EventListItem } from '@litemetrics/client';
import { queryKeys } from '../hooks/useAnalytics';
import { getBrowserIcon, getOSIcon, getDeviceIcon } from './icons';
import { ExportButton } from './ExportButton';

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
          className="bg-white border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 w-80"
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
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error instanceof Error ? error.message : 'Failed to fetch users'}
        </div>
      )}

      {/* Users table */}
      <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-100 text-left">
              <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase">User</th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Events</th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Pages</th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Sessions</th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Last Seen</th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Location</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="border-b border-zinc-50">
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-5 bg-zinc-100 rounded animate-pulse" />
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
              users.map((user) => (
                <tr
                  key={user.visitorId}
                  className="border-b border-zinc-50 hover:bg-zinc-50/50 cursor-pointer transition-colors"
                  onClick={() => onSelect(user.visitorId)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0"
                        style={{ backgroundColor: hashColor(user.visitorId) }}
                      >
                        {(user.userId || user.visitorId).slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-zinc-800">
                          {user.userId || (
                            <span className="text-zinc-400">Anonymous</span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-400 font-mono truncate max-w-[140px]">
                          {user.visitorId}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-zinc-700 tabular-nums">
                    {user.totalEvents.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-zinc-700 tabular-nums">
                    {user.totalPageviews.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-zinc-700 tabular-nums">
                    {user.totalSessions.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-zinc-500">
                    {formatRelative(user.lastSeen)}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-zinc-500">
                    {user.geo?.country ? (
                      <span>{countryToFlag(user.geo.country)} {[user.geo.city, user.geo.country].filter(Boolean).join(', ')}</span>
                    ) : '—'}
                  </td>
                </tr>
              ))
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
            className="px-3 py-1.5 text-sm border border-zinc-200 rounded-lg hover:border-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-zinc-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-sm border border-zinc-200 rounded-lg hover:border-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ─── User Detail View ────────────────────────────────────

function UserDetailView({ siteId, client, visitorId, onBack }: { siteId: string; client: LitemetricsClient; visitorId: string; onBack: () => void }) {
  const [eventsPage, setEventsPage] = useState(0);
  const eventsLimit = 30;

  const { data: user, isLoading: loading, error } = useQuery({
    queryKey: queryKeys.userDetail(siteId, visitorId),
    queryFn: async () => {
      client.setSiteId(siteId);
      return client.getUserDetail(visitorId);
    },
  });

  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: queryKeys.userEvents(siteId, visitorId, { page: eventsPage }),
    queryFn: async () => {
      client.setSiteId(siteId);
      const result = await client.getUserEvents(visitorId, {
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
        <div className="h-8 w-48 bg-zinc-100 rounded animate-pulse" />
        <div className="h-40 bg-zinc-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="text-sm text-indigo-600 hover:text-indigo-800">
          &larr; Back to users
        </button>
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error instanceof Error ? error.message : 'User not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-sm text-indigo-600 hover:text-indigo-800">
          &larr; Back
        </button>
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            {user.userId || 'Anonymous User'}
          </h2>
          <p className="text-xs text-zinc-400 font-mono">{user.visitorId}</p>
        </div>
      </div>

      {/* User info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoCard label="Total Events" value={user.totalEvents.toLocaleString()} />
        <InfoCard label="Pageviews" value={user.totalPageviews.toLocaleString()} />
        <InfoCard label="Sessions" value={user.totalSessions.toLocaleString()} />
        <InfoCard label="First Seen" value={formatRelative(user.firstSeen)} />
      </div>

      {/* User profile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Details */}
        <div className="rounded-xl bg-white border border-zinc-200 p-5">
          <h3 className="text-sm font-medium text-zinc-500 mb-4">Profile</h3>
          <div className="space-y-3">
            {user.userId && <ProfileField label="User ID" value={user.userId} />}
            <ProfileField label="Visitor ID" value={user.visitorId} mono />
            <ProfileField label="First Seen" value={new Date(user.firstSeen).toLocaleString()} />
            <ProfileField label="Last Seen" value={new Date(user.lastSeen).toLocaleString()} />
            {user.lastUrl && <ProfileField label="Last Page" value={user.lastUrl} />}
            {user.device && (
              <div>
                <p className="text-xs text-zinc-400 mb-1">Device</p>
                <div className="flex items-center gap-3 text-sm text-zinc-800">
                  <span className="flex items-center gap-1">{getBrowserIcon(user.device.browser)} {user.device.browser}</span>
                  <span className="text-zinc-300">|</span>
                  <span className="flex items-center gap-1">{getOSIcon(user.device.os)} {user.device.os}</span>
                  <span className="text-zinc-300">|</span>
                  <span className="flex items-center gap-1">{getDeviceIcon(user.device.type)} {user.device.type}</span>
                </div>
              </div>
            )}
            {user.geo && (
              <ProfileField
                label="Location"
                value={[user.geo.city, user.geo.region, user.geo.country].filter(Boolean).join(', ')}
              />
            )}
            {user.language && <ProfileField label="Language" value={user.language} />}
          </div>
        </div>

        {/* Traits */}
        <div className="rounded-xl bg-white border border-zinc-200 p-5">
          <h3 className="text-sm font-medium text-zinc-500 mb-4">Traits</h3>
          {user.traits && Object.keys(user.traits).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(user.traits).map(([key, value]) => (
                <ProfileField key={key} label={key} value={String(value)} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-400">No traits set</p>
          )}
        </div>
      </div>

      {/* Event timeline */}
      <div className="rounded-xl bg-white border border-zinc-200 p-5">
        <h3 className="text-sm font-medium text-zinc-500 mb-4">
          Event Timeline
          <span className="text-zinc-400 font-normal ml-2">({eventsTotal})</span>
        </h3>

        {eventsLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-zinc-100 rounded animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-zinc-400">No events</p>
        ) : (
          <div className="space-y-0">
            {events.map((event, i) => (
              <TimelineEvent key={event.id} event={event} isLast={i === events.length - 1} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {eventsTotalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-100">
            <button
              onClick={() => setEventsPage((p) => Math.max(0, p - 1))}
              disabled={eventsPage === 0}
              className="px-3 py-1.5 text-sm border border-zinc-200 rounded-lg hover:border-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-zinc-500">
              Page {eventsPage + 1} of {eventsTotalPages}
            </span>
            <button
              onClick={() => setEventsPage((p) => Math.min(eventsTotalPages - 1, p + 1))}
              disabled={eventsPage >= eventsTotalPages - 1}
              className="px-3 py-1.5 text-sm border border-zinc-200 rounded-lg hover:border-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white border border-zinc-200 p-4">
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      <p className="text-xl font-semibold text-zinc-900 tabular-nums">{value}</p>
    </div>
  );
}

function ProfileField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
      <p className={`text-sm text-zinc-800 break-all ${mono ? 'font-mono' : ''}`}>{value}</p>
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
        {!isLast && <div className="w-px flex-1 bg-zinc-200 my-1" />}
      </div>

      {/* Content */}
      <div className={`flex-1 pb-4 ${isLast ? '' : ''}`}>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-zinc-700">{config.label}</span>
          {detail && (
            <span className="text-sm text-zinc-500 truncate max-w-xs" title={detail}>{detail}</span>
          )}
          <span className="text-xs text-zinc-400 ml-auto flex-shrink-0">{dateStr} {timeStr}</span>
        </div>
        {event.properties && Object.keys(event.properties).length > 0 && (
          <div className="mt-1.5 text-xs text-zinc-500 bg-zinc-50 rounded px-2 py-1 font-mono">
            {Object.entries(event.properties).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')}
          </div>
        )}
        {event.traits && Object.keys(event.traits).length > 0 && (
          <div className="mt-1.5 text-xs text-zinc-500 bg-zinc-50 rounded px-2 py-1 font-mono">
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
