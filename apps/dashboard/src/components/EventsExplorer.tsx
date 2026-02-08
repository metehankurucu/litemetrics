import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LitemetricsClient, EventListItem, EventType, Period, Site } from '@litemetrics/client';
import { createSitesClient } from '@litemetrics/client';
import { queryKeys } from '../hooks/useAnalytics';
import { getBrowserIcon, getOSIcon, getDeviceIcon, countryToFlag } from './icons';
import { ExportButton } from './ExportButton';
import { useAuth } from '../auth';

interface EventsExplorerProps {
  siteId: string;
  client: LitemetricsClient;
  onUserClick?: (visitorId: string) => void;
}

type ExtendedEventType = EventType | 'conversion' | '';

const typeFilters: { value: ExtendedEventType; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'pageview', label: 'Pageviews' },
  { value: 'event', label: 'Events' },
  { value: 'conversion', label: 'Conversions' },
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
  const { adminSecret } = useAuth();
  // Filters
  const [typeFilter, setTypeFilter] = useState<ExtendedEventType>('');
  const [eventNameFilter, setEventNameFilter] = useState('');
  const [selectedEventName, setSelectedEventName] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'auto' | 'manual' | ''>('');
  const [period, setPeriod] = useState<Period>('24h');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const limit = 30;

  const { data: site } = useQuery({
    queryKey: ['site', siteId],
    queryFn: async () => {
      const sitesClient = createSitesClient({
        baseUrl: import.meta.env.VITE_LITEMETRICS_URL || '',
        adminSecret: adminSecret!,
      });
      const result = await sitesClient.getSite(siteId);
      return result.site as Site;
    },
    enabled: !!adminSecret,
  });

  const conversionEvents = site?.conversionEvents ?? [];
  const isConversionFilter = typeFilter === 'conversion';
  const effectiveType = isConversionFilter ? 'event' : (typeFilter || undefined);
  const eventNames = isConversionFilter ? conversionEvents : undefined;

  const { data: topEventsData } = useQuery({
    queryKey: ['topEvents', siteId, period, typeFilter, isConversionFilter ? conversionEvents.join('|') : ''],
    queryFn: async () => {
      client.setSiteId(siteId);
      if (isConversionFilter) {
        return conversionEvents.map((name) => ({ key: name }));
      }
      const result = await client.getStats('top_events', { period, limit: 50 });
      return result.data;
    },
  });

  const { data, isLoading: loading, error } = useQuery({
    queryKey: queryKeys.events(siteId, { type: effectiveType, eventName: eventNameFilter, eventNames, eventSource: sourceFilter, period, page }),
    queryFn: async () => {
      client.setSiteId(siteId);
      const result = await client.getEventsList({
        type: effectiveType,
        eventName: eventNameFilter || undefined,
        eventNames,
        eventSource: sourceFilter || undefined,
        period,
        limit,
        offset: page * limit,
      });
      return { events: result.events, total: result.total };
    },
    placeholderData: (prev) => prev,
  });

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  // Reset page when filters change
  const handleTypeChange = (v: ExtendedEventType) => {
    setTypeFilter(v);
    setEventNameFilter('');
    setSelectedEventName('');
    setPage(0);
  };
  const handleNameChange = (v: string) => {
    setEventNameFilter(v);
    if (!v || v !== selectedEventName) setSelectedEventName('');
    setPage(0);
  };
  const handlePeriodChange = (v: Period) => { setPeriod(v); setPage(0); };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => handleTypeChange(e.target.value as ExtendedEventType)}
          className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm dark:text-zinc-200"
        >
          {typeFilters.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        {/* Source filter */}
        <div className="inline-flex gap-0.5 bg-zinc-100/80 dark:bg-zinc-800 rounded-lg p-1 border border-zinc-200/60 dark:border-zinc-700 shadow-sm">
          {[
            { value: '', label: 'All' },
            { value: 'auto', label: 'Auto' },
            { value: 'manual', label: 'Manual' },
          ].map((s) => (
            <button
              key={s.value}
              onClick={() => { setSourceFilter(s.value as '' | 'auto' | 'manual'); setPage(0); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
                sourceFilter === s.value
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-zinc-200/60 dark:ring-zinc-600'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Event name filter */}
        <input
          type="text"
          placeholder="Filter by event name..."
          value={eventNameFilter}
          onChange={(e) => handleNameChange(e.target.value)}
          className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm dark:text-zinc-200 w-48"
        />

        {/* Event name select */}
        <select
          value={selectedEventName}
          onChange={(e) => {
            const v = e.target.value;
            setSelectedEventName(v);
            setEventNameFilter(v);
            setPage(0);
          }}
          disabled={typeFilter === 'pageview' || typeFilter === 'identify'}
          className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm dark:text-zinc-200"
        >
          <option value="">{isConversionFilter ? 'All Conversions' : 'All Events'}</option>
          {(topEventsData ?? []).map((e) => (
            <option key={e.key} value={e.key}>{e.key}</option>
          ))}
        </select>

        {/* Period */}
        <div className="inline-flex gap-0.5 bg-zinc-100/80 dark:bg-zinc-800 rounded-lg p-1 border border-zinc-200/60 dark:border-zinc-700 shadow-sm">
          {periodFilters.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePeriodChange(p.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
                period === p.value
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-zinc-200/60 dark:ring-zinc-600'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
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
            source: e.eventSource,
            subtype: e.eventSubtype,
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
        <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
          {error instanceof Error ? error.message : 'Failed to fetch events'}
        </div>
      )}

      {/* Events table */}
      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Time</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Detail</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Visitor</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Location</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="border-b border-zinc-50 dark:border-zinc-800">
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-5 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
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
            className="px-3 py-1.5 text-sm font-medium border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow disabled:opacity-30 disabled:cursor-not-allowed transition-all text-zinc-700 dark:text-zinc-300"
          >
            Previous
          </button>
          <span className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
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
    pageview: { label: 'PV', color: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400' },
    event: { label: 'EV', color: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400' },
    identify: { label: 'ID', color: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400' },
  };

  const badge = typeBadge[event.type];
  const isAuto = event.eventSource === 'auto';

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
        className="border-b border-zinc-50 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5">
          <div className="text-sm text-zinc-700 dark:text-zinc-300">{timeStr}</div>
          <div className="text-xs text-zinc-400 dark:text-zinc-500">{dateStr}</div>
        </td>
        <td className="px-4 py-2.5">
          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${badge.color}`}>
            {badge.label}
          </span>
          {isAuto && (
            <span className="inline-block ml-2 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
              Auto
            </span>
          )}
        </td>
        <td className="px-4 py-2.5">
          <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate block max-w-xs" title={detail}>
            {detail || '—'}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUserClick?.(event.visitorId);
            }}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-mono truncate block max-w-[140px] text-left"
            title={event.visitorId}
          >
            {event.visitorId.slice(0, 12)}...
          </button>
        </td>
        <td className="px-4 py-2.5">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">{location || '—'}</span>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-zinc-50/80 dark:bg-zinc-800/50">
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

  if (event.eventSource) fields.push(['Source', event.eventSource]);
  if (event.eventSubtype) fields.push(['Subtype', event.eventSubtype]);
  if (event.url) fields.push(['URL', event.url]);
  if (event.referrer) fields.push(['Referrer', event.referrer]);
  if (event.title) fields.push(['Page Title', event.title]);
  if (event.name) fields.push(['Event Name', event.name]);
  if (event.pagePath) fields.push(['Page Path', event.pagePath]);
  if (event.targetUrlPath) fields.push(['Target URL', event.targetUrlPath]);
  if (event.elementSelector) fields.push(['Element', event.elementSelector]);
  if (event.elementText) fields.push(['Element Text', event.elementText]);
  if (event.scrollDepthPct !== undefined) fields.push(['Scroll Depth', `${event.scrollDepthPct}%`]);
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
          <span className="text-xs text-zinc-400 dark:text-zinc-500 w-24 flex-shrink-0 pt-0.5">{label}</span>
          {label === 'Visitor ID' ? (
            <button
              onClick={() => onUserClick?.(value!)}
              className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-mono break-all text-left"
            >
              {value}
            </button>
          ) : (
            <span className="text-sm text-zinc-700 dark:text-zinc-300 break-all">{value}</span>
          )}
        </div>
      ))}
      {event.device && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 dark:text-zinc-500 w-24 flex-shrink-0">Browser</span>
            <span className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              {getBrowserIcon(event.device.browser)} {event.device.browser}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 dark:text-zinc-500 w-24 flex-shrink-0">OS</span>
            <span className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              {getOSIcon(event.device.os)} {event.device.os}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 dark:text-zinc-500 w-24 flex-shrink-0">Device</span>
            <span className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              {getDeviceIcon(event.device.type)} {event.device.type}
            </span>
          </div>
        </>
      )}
      {event.properties && Object.keys(event.properties).length > 0 && (
        <div className="md:col-span-2 mt-2">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">Properties</span>
          <pre className="mt-1 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 text-zinc-700 dark:text-zinc-300 overflow-x-auto">
            {JSON.stringify(event.properties, null, 2)}
          </pre>
        </div>
      )}
      {event.traits && Object.keys(event.traits).length > 0 && (
        <div className="md:col-span-2 mt-2">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">Traits</span>
          <pre className="mt-1 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 text-zinc-700 dark:text-zinc-300 overflow-x-auto">
            {JSON.stringify(event.traits, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
