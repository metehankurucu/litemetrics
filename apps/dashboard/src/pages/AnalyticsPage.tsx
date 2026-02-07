import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryResult, Period, LitemetricsClient } from '@litemetrics/client';
import { queryKeys } from '../hooks/useAnalytics';
import { StatCard } from '../components/StatCard';
import { TopList, type TopListType } from '../components/TopList';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { PeriodSelector } from '../components/PeriodSelector';
import { WorldMap } from '../components/WorldMap';
import { PieChartCard } from '../components/PieChartCard';
import { ExportButton } from '../components/ExportButton';

type TopMetric = 'top_pages' | 'top_referrers' | 'top_countries' | 'top_events' | 'top_browsers' | 'top_devices';

const topMetrics: { metric: TopMetric; title: string; type: TopListType }[] = [
  { metric: 'top_pages', title: 'Pages', type: 'pages' },
  { metric: 'top_referrers', title: 'Referrers', type: 'referrers' },
  { metric: 'top_countries', title: 'Countries', type: 'countries' },
  { metric: 'top_events', title: 'Events', type: 'events' },
  { metric: 'top_browsers', title: 'Browsers', type: 'browsers' },
  { metric: 'top_devices', title: 'Devices', type: 'devices' },
];

interface AnalyticsPageProps {
  siteId: string;
  client: LitemetricsClient;
  period: Period;
  onPeriodChange: (p: Period) => void;
}

export function AnalyticsPage({ siteId, client, period, onPeriodChange }: AnalyticsPageProps) {
  const queryClient = useQueryClient();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const effectivePeriod = period;
  const statsOptions = period === 'custom' && dateFrom && dateTo
    ? { period, dateFrom: new Date(dateFrom).toISOString(), dateTo: new Date(dateTo + 'T23:59:59').toISOString() }
    : { period };

  const { data, isLoading: loading, error } = useQuery({
    queryKey: queryKeys.analytics(siteId, period, dateFrom, dateTo),
    queryFn: async () => {
      client.setSiteId(siteId);
      const [overviewResults, ...topResults] = await Promise.all([
        client.getOverview(['pageviews', 'visitors', 'sessions', 'events'], { ...statsOptions, compare: true }),
        ...topMetrics.map((t) => client.getStats(t.metric, { ...statsOptions, limit: 10 })),
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
          <ExportButton data={exportData} filename={`analytics-${siteId}-${period}`} />
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.analytics(siteId, period, dateFrom, dateTo) })}
            className="p-2 rounded-lg bg-white border border-zinc-200 text-zinc-500 hover:text-zinc-700 hover:border-zinc-300 transition-colors"
            title="Refresh"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error instanceof Error ? error.message : 'Failed to fetch analytics'}
        </div>
      )}

      {/* Time Series Chart */}
      <TimeSeriesChart client={client} siteId={siteId} period={effectivePeriod} />

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-6">
        <StatCard
          title="Pageviews"
          value={overview.pageviews?.total ?? 0}
          changePercent={overview.pageviews?.changePercent}
          loading={loading}
        />
        <StatCard
          title="Visitors"
          value={overview.visitors?.total ?? 0}
          changePercent={overview.visitors?.changePercent}
          loading={loading}
        />
        <StatCard
          title="Sessions"
          value={overview.sessions?.total ?? 0}
          changePercent={overview.sessions?.changePercent}
          loading={loading}
        />
        <StatCard
          title="Events"
          value={overview.events?.total ?? 0}
          changePercent={overview.events?.changePercent}
          loading={loading}
        />
      </div>

      {/* World Map */}
      <WorldMap client={client} siteId={siteId} period={effectivePeriod} />

      {/* Pie Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <PieChartCard title="Browsers" data={browserPieData} loading={loading} />
        <PieChartCard title="Devices" data={devicePieData} loading={loading} />
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
