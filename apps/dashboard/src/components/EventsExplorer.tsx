import { useState, useEffect, useCallback } from 'react';
import type { LitemetricsClient, EventListItem, EventType, Period } from '@litemetrics/client';
import { getBrowserIcon, getOSIcon, getDeviceIcon } from './icons';
import { ExportButton } from './ExportButton';

interface EventsExplorerProps {
  siteId: string;
  client: LitemetricsClient;
  onUserClick?: (visitorId: string) => void;
}

const typeFilters: { value: EventType | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'pageview', label: 'Pageviews' },
  { value: 'event', label: 'Events' },
  { value: 'identify', label: 'Identify' },
];

const periodFilters: { value: Period; label: string }[] = [
  { value: '1h', label: '1H' },
  { value: '24h', label: '24H' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
];

export function EventsExplorer({ siteId, client, onUserClick }: EventsExplorerProps) {
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<EventType | ''>('');
  const [eventNameFilter, setEventNameFilter] = useState('');
  const [period, setPeriod] = useState<Period>('24h');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const limit = 30;

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    client.setSiteId(siteId);

    try {
      const result = await client.getEventsList({
        type: typeFilter || undefined,
        eventName: eventNameFilter || undefined,
        period,
        limit,
        offset: page * limit,
      });
      setEvents(result.events);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      setLoading(false);
    }
  }, [siteId, typeFilter, eventNameFilter, period, page]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    setPage(0);
  }, [typeFilter, eventNameFilter, period]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as EventType | '')}
          className="bg-white border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
        >
          {typeFilters.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        {/* Event name filter */}
        <input
          type="text"
          placeholder="Filter by event name..."
          value={eventNameFilter}
          onChange={(e) => setEventNameFilter(e.target.value)}
          className="bg-white border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 w-48"
        />

        {/* Period */}
        <div className="flex gap-1 bg-zinc-100 rounded-lg p-1 border border-zinc-200">
          {periodFilters.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                period === p.value
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Count + Export */}
        <span className="text-sm text-zinc-400 ml-auto">
          {total.toLocaleString()} event{total !== 1 ? 's' : ''}
        </span>
        <ExportButton
          data={events.map((e) => ({
            time: new Date(e.timestamp).toISOString(),
            type: e.type,
            detail: e.type === 'pageview' ? e.url : e.type === 'event' ? e.name : e.userId,
            visitor: e.visitorId,
            country: e.geo?.country ?? '',
            city: e.geo?.city ?? '',
          }))}
          filename={`events-${siteId}`}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Events table */}
      <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-100 text-left">
              <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Time</th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Type</th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Detail</th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Visitor</th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase">Location</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="border-b border-zinc-50">
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-5 bg-zinc-100 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-zinc-400 text-sm">
                  No events found
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  expanded={expanded === event.id}
                  onToggle={() => setExpanded(expanded === event.id ? null : event.id)}
                  onUserClick={onUserClick}
                />
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

function EventRow({
  event,
  expanded,
  onToggle,
  onUserClick,
}: {
  event: EventListItem;
  expanded: boolean;
  onToggle: () => void;
  onUserClick?: (visitorId: string) => void;
}) {
  const time = new Date(event.timestamp);
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = time.toLocaleDateString([], { month: 'short', day: 'numeric' });

  const typeBadge = {
    pageview: { label: 'PV', color: 'bg-blue-100 text-blue-700' },
    event: { label: 'EV', color: 'bg-purple-100 text-purple-700' },
    identify: { label: 'ID', color: 'bg-green-100 text-green-700' },
  };

  const badge = typeBadge[event.type];

  // Detail column: URL for pageview, name for event, userId for identify
  let detail = '';
  if (event.type === 'pageview') {
    try {
      detail = new URL(event.url || '').pathname;
    } catch {
      detail = event.url || '';
    }
  } else if (event.type === 'event') {
    detail = event.name || '';
  } else if (event.type === 'identify') {
    detail = event.userId || '';
  }

  const location = [event.geo?.city, event.geo?.country].filter(Boolean).join(', ');

  return (
    <>
      <tr
        className="border-b border-zinc-50 hover:bg-zinc-50/50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5">
          <div className="text-sm text-zinc-700">{timeStr}</div>
          <div className="text-xs text-zinc-400">{dateStr}</div>
        </td>
        <td className="px-4 py-2.5">
          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${badge.color}`}>
            {badge.label}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span className="text-sm text-zinc-700 truncate block max-w-xs" title={detail}>
            {detail || '—'}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUserClick?.(event.visitorId);
            }}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-mono truncate block max-w-[140px] text-left"
            title={event.visitorId}
          >
            {event.visitorId.slice(0, 12)}...
          </button>
        </td>
        <td className="px-4 py-2.5">
          <span className="text-sm text-zinc-500">{location || '—'}</span>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-zinc-50/80">
          <td colSpan={5} className="px-4 py-4">
            <EventDetail event={event} onUserClick={onUserClick} />
          </td>
        </tr>
      )}
    </>
  );
}

function EventDetail({ event, onUserClick }: { event: EventListItem; onUserClick?: (visitorId: string) => void }) {
  const fields: [string, string | undefined][] = [
    ['Type', event.type],
    ['Timestamp', new Date(event.timestamp).toLocaleString()],
    ['Visitor ID', event.visitorId],
    ['Session ID', event.sessionId],
  ];

  if (event.url) fields.push(['URL', event.url]);
  if (event.referrer) fields.push(['Referrer', event.referrer]);
  if (event.title) fields.push(['Page Title', event.title]);
  if (event.name) fields.push(['Event Name', event.name]);
  if (event.userId) fields.push(['User ID', event.userId]);
  if (event.geo) {
    const countryFlag = event.geo.country ? countryToFlag(event.geo.country) + ' ' : '';
    fields.push(['Location', countryFlag + [event.geo.city, event.geo.region, event.geo.country].filter(Boolean).join(', ')]);
  }
  if (event.language) fields.push(['Language', event.language]);
  if (event.utm) {
    const utm = Object.entries(event.utm).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ');
    if (utm) fields.push(['UTM', utm]);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
      {fields.map(([label, value]) => (
        <div key={label} className="flex items-start gap-2">
          <span className="text-xs text-zinc-400 w-24 flex-shrink-0 pt-0.5">{label}</span>
          {label === 'Visitor ID' ? (
            <button
              onClick={() => onUserClick?.(value!)}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-mono break-all text-left"
            >
              {value}
            </button>
          ) : (
            <span className="text-sm text-zinc-700 break-all">{value}</span>
          )}
        </div>
      ))}
      {event.device && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 w-24 flex-shrink-0">Browser</span>
            <span className="flex items-center gap-1.5 text-sm text-zinc-700">
              {getBrowserIcon(event.device.browser)} {event.device.browser}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 w-24 flex-shrink-0">OS</span>
            <span className="flex items-center gap-1.5 text-sm text-zinc-700">
              {getOSIcon(event.device.os)} {event.device.os}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 w-24 flex-shrink-0">Device</span>
            <span className="flex items-center gap-1.5 text-sm text-zinc-700">
              {getDeviceIcon(event.device.type)} {event.device.type}
            </span>
          </div>
        </>
      )}
      {event.properties && Object.keys(event.properties).length > 0 && (
        <div className="md:col-span-2 mt-2">
          <span className="text-xs text-zinc-400">Properties</span>
          <pre className="mt-1 text-xs bg-white border border-zinc-200 rounded-lg p-3 text-zinc-700 overflow-x-auto">
            {JSON.stringify(event.properties, null, 2)}
          </pre>
        </div>
      )}
      {event.traits && Object.keys(event.traits).length > 0 && (
        <div className="md:col-span-2 mt-2">
          <span className="text-xs text-zinc-400">Traits</span>
          <pre className="mt-1 text-xs bg-white border border-zinc-200 rounded-lg p-3 text-zinc-700 overflow-x-auto">
            {JSON.stringify(event.traits, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function countryToFlag(code: string): string {
  if (code.length !== 2) return '';
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    ...Array.from(upper).map((c) => 0x1F1E6 + c.charCodeAt(0) - 65)
  );
}
