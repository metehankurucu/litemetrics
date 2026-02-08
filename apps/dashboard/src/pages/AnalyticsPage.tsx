import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryResult, Period, LitemetricsClient, Site } from '@litemetrics/client';
import { createSitesClient } from '@litemetrics/client';
import { queryKeys } from '../hooks/useAnalytics';
import { StatCard } from '../components/StatCard';
import { TopList, type TopListType } from '../components/TopList';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { PeriodSelector } from '../components/PeriodSelector';
import { WorldMap } from '../components/WorldMap';
import { PieChartCard } from '../components/PieChartCard';
import { ExportButton } from '../components/ExportButton';
import { SegmentFilters, type SegmentFilter, filtersToRecord } from '../components/SegmentFilters';
import { useAuth } from '../auth';
import { Eye, Users, MousePointerClick, Zap, Target, RefreshCw, Monitor, Smartphone } from 'lucide-react';

type TopMetric = 'top_pages' | 'top_referrers' | 'top_countries' | 'top_events' | 'top_conversions' | 'top_browsers' | 'top_devices' | 'top_utm_sources' | 'top_utm_mediums' | 'top_utm_campaigns';

const topMetrics: { metric: TopMetric; title: string; type: TopListType }[] = [
  { metric: 'top_pages', title: 'Pages', type: 'pages' },
  { metric: 'top_referrers', title: 'Referrers', type: 'referrers' },
  { metric: 'top_countries', title: 'Countries', type: 'countries' },
  { metric: 'top_events', title: 'Events', type: 'events' },
  { metric: 'top_conversions', title: 'Top Conversions', type: 'conversions' },
  { metric: 'top_browsers', title: 'Browsers', type: 'browsers' },
  { metric: 'top_devices', title: 'Devices', type: 'devices' },
  { metric: 'top_utm_sources', title: 'UTM Sources', type: 'utm_sources' },
  { metric: 'top_utm_mediums', title: 'UTM Mediums', type: 'utm_mediums' },
  { metric: 'top_utm_campaigns', title: 'UTM Campaigns', type: 'utm_campaigns' },
];

interface AnalyticsPageProps {
  siteId: string;
  client: LitemetricsClient;
  period: Period;
  onPeriodChange: (p: Period) => void;
}

export function AnalyticsPage({ siteId, client, period, onPeriodChange }: AnalyticsPageProps) {
  const queryClient = useQueryClient();
  const { adminSecret } = useAuth();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filters, setFilters] = useState<SegmentFilter[]>([]);
  const filterMap = useMemo(() => filtersToRecord(filters), [filters]);

  const effectivePeriod = period;
  const statsOptions = period === 'custom' && dateFrom && dateTo
    ? { period, dateFrom: new Date(dateFrom).toISOString(), dateTo: new Date(dateTo + 'T23:59:59').toISOString() }
    : { period };

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

  const { data, isLoading: loading, error } = useQuery({
    queryKey: queryKeys.analytics(siteId, period, dateFrom, dateTo, filterMap),
    queryFn: async () => {
      client.setSiteId(siteId);
      const withFilters = { ...statsOptions, filters: filterMap };
      const [overviewResults, ...topResults] = await Promise.all([
        client.getOverview(['pageviews', 'visitors', 'sessions', 'events', 'conversions'], { ...withFilters, compare: true }),
        ...topMetrics.map((t) => client.getStats(t.metric, { ...withFilters, limit: 10 })),
      ]);

      const topMap: Record<string, QueryResult> = {};
      topMetrics.forEach((t, i) => {
        topMap[t.metric] = topResults[i];
      });

      return {
        overview: overviewResults as unknown as Record<string, QueryResult>,
        tops: topMap,
      };
    },
    enabled: period !== 'custom' || (!!dateFrom && !!dateTo),
  });

  const overview = data?.overview ?? {};
  const tops = data?.tops ?? {};
  const conversionEvents = site?.conversionEvents ?? [];
  const showConversionWarning = !!site && conversionEvents.length === 0;

  const { data: liveData, isLoading: liveLoading } = useQuery({
    queryKey: queryKeys.live(siteId),
    queryFn: async () => {
      client.setSiteId(siteId);
      const result = await client.getStats('visitors', { period: '1h' });
      return { activeVisitors: result.total };
    },
    refetchInterval: 10_000,
  });

  const activeVisitors = liveData?.activeVisitors ?? 0;

  // Build pie chart data from top lists
  const browserPieData = (tops.top_browsers?.data ?? []).map((d) => ({ name: d.key, value: d.value }));
  const devicePieData = (tops.top_devices?.data ?? []).map((d) => ({ name: d.key, value: d.value }));

  // Build export data from all top lists combined
  const exportData = Object.entries(tops).flatMap(([metric, result]) =>
    (result?.data ?? []).map((d) => ({ metric, key: d.key, value: d.value }))
  );

  return (
    <>
      {/* Period selector + refresh + export */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <PeriodSelector
          value={period}
          onChange={onPeriodChange}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
        />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700 rounded-full px-3 py-1.5 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            {liveLoading ? (
              <span className="inline-block h-3 w-12 bg-zinc-100 dark:bg-zinc-700 rounded" />
            ) : (
              <span className="tabular-nums">{activeVisitors} live (1h)</span>
            )}
          </div>
          <ExportButton data={exportData} filename={`analytics-${siteId}-${period}`} />
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.analytics(siteId, period, dateFrom, dateTo, filterMap) })}
            className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow transition-all"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <SegmentFilters value={filters} onChange={setFilters} />

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
          {error instanceof Error ? error.message : 'Failed to fetch analytics'}
        </div>
      )}

      {/* Time Series Chart */}
      <TimeSeriesChart client={client} siteId={siteId} period={effectivePeriod} filters={filterMap} />

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-5 mb-6">
        <StatCard
          title="Pageviews"
          icon={<Eye className="w-3.5 h-3.5" />}
          value={overview.pageviews?.total ?? 0}
          changePercent={overview.pageviews?.changePercent}
          loading={loading}
        />
        <StatCard
          title="Visitors"
          icon={<Users className="w-3.5 h-3.5" />}
          value={overview.visitors?.total ?? 0}
          changePercent={overview.visitors?.changePercent}
          loading={loading}
        />
        <StatCard
          title="Sessions"
          icon={<MousePointerClick className="w-3.5 h-3.5" />}
          value={overview.sessions?.total ?? 0}
          changePercent={overview.sessions?.changePercent}
          loading={loading}
        />
        <StatCard
          title="Events"
          icon={<Zap className="w-3.5 h-3.5" />}
          value={overview.events?.total ?? 0}
          changePercent={overview.events?.changePercent}
          loading={loading}
        />
        <StatCard
          title="Conversions"
          icon={<Target className="w-3.5 h-3.5" />}
          value={overview.conversions?.total ?? 0}
          changePercent={overview.conversions?.changePercent}
          loading={loading}
        />
      </div>
      {showConversionWarning && (
        <div className="mb-6 p-3 rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
          Conversions are not configured for this site. Add event names in Site Settings to start tracking conversions.
        </div>
      )}

      {/* World Map */}
      <WorldMap client={client} siteId={siteId} period={effectivePeriod} filters={filterMap} />

      {/* Pie Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <PieChartCard title="Browsers" data={browserPieData} loading={loading} icon={<Monitor className="w-3.5 h-3.5" />} />
        <PieChartCard title="Devices" data={devicePieData} loading={loading} icon={<Smartphone className="w-3.5 h-3.5" />} />
      </div>

      {/* Top Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {topMetrics.map((t) => (
          <TopList
            key={t.metric}
            title={t.title}
            type={t.type}
            data={tops[t.metric]?.data ?? null}
            loading={loading}
          />
        ))}
      </div>
    </>
  );
}
