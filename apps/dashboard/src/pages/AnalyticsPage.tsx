import { useState, useEffect, useCallback } from 'react';
import type { QueryResult, Period, InsaytClient } from '@insayt/client';
import { StatCard } from '../components/StatCard';
import { TopList } from '../components/TopList';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { PeriodSelector } from '../components/PeriodSelector';
import { WorldMap } from '../components/WorldMap';
import { PieChartCard } from '../components/PieChartCard';
import { ExportButton } from '../components/ExportButton';

type TopMetric = 'top_pages' | 'top_referrers' | 'top_countries' | 'top_events' | 'top_browsers' | 'top_devices';

const topMetrics: { metric: TopMetric; title: string }[] = [
  { metric: 'top_pages', title: 'Pages' },
  { metric: 'top_referrers', title: 'Referrers' },
  { metric: 'top_countries', title: 'Countries' },
  { metric: 'top_events', title: 'Events' },
  { metric: 'top_browsers', title: 'Browsers' },
  { metric: 'top_devices', title: 'Devices' },
];

interface AnalyticsPageProps {
  siteId: string;
  client: InsaytClient;
  period: Period;
  onPeriodChange: (p: Period) => void;
}

export function AnalyticsPage({ siteId, client, period, onPeriodChange }: AnalyticsPageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Record<string, QueryResult>>({});
  const [tops, setTops] = useState<Record<string, QueryResult>>({});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const effectivePeriod = period;
  const statsOptions = period === 'custom' && dateFrom && dateTo
    ? { period, dateFrom: new Date(dateFrom).toISOString(), dateTo: new Date(dateTo + 'T23:59:59').toISOString() }
    : { period };

  const fetchAll = useCallback(async () => {
    if (period === 'custom' && (!dateFrom || !dateTo)) return;

    setLoading(true);
    setError(null);
    client.setSiteId(siteId);

    try {
      const [overviewResults, ...topResults] = await Promise.all([
        client.getOverview(['pageviews', 'visitors', 'sessions', 'events'], { ...statsOptions, compare: true }),
        ...topMetrics.map((t) => client.getStats(t.metric, { ...statsOptions, limit: 10 })),
      ]);

      setOverview(overviewResults as unknown as Record<string, QueryResult>);

      const topMap: Record<string, QueryResult> = {};
      topMetrics.forEach((t, i) => {
        topMap[t.metric] = topResults[i];
      });
      setTops(topMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }, [client, siteId, period, dateFrom, dateTo]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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
            onClick={fetchAll}
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
          {error}
        </div>
      )}

      {/* Time Series Chart */}
      <TimeSeriesChart client={client} siteId={siteId} period={effectivePeriod} />

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <PieChartCard title="Browsers" data={browserPieData} loading={loading} />
        <PieChartCard title="Devices" data={devicePieData} loading={loading} />
      </div>

      {/* Top Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {topMetrics.map((t) => (
          <TopList
            key={t.metric}
            title={t.title}
            data={tops[t.metric]?.data ?? null}
            loading={loading}
          />
        ))}
      </div>
    </>
  );
}
