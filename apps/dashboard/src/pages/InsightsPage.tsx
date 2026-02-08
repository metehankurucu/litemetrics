import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LitemetricsClient, Period, QueryResult, TimeSeriesPoint } from '@litemetrics/client';
import { queryKeys } from '../hooks/useAnalytics';
import { PeriodSelector } from '../components/PeriodSelector';
import { SegmentFilters, type SegmentFilter, filtersToRecord } from '../components/SegmentFilters';
import { TopList } from '../components/TopList';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface InsightsPageProps {
  siteId: string;
  client: LitemetricsClient;
  period: Period;
  onPeriodChange: (p: Period) => void;
}

type InsightMetric =
  | 'top_exit_pages'
  | 'top_transitions'
  | 'top_scroll_pages'
  | 'top_button_clicks'
  | 'top_link_targets';

const insightMetrics: { metric: InsightMetric; title: string }[] = [
  { metric: 'top_exit_pages', title: 'Exit Pages' },
  { metric: 'top_transitions', title: 'Top Transitions' },
  { metric: 'top_scroll_pages', title: 'Most Scrolled Pages' },
  { metric: 'top_button_clicks', title: 'Top Button Clicks' },
  { metric: 'top_link_targets', title: 'Top Link Targets' },
];

function aggregateByHour(data: TimeSeriesPoint[]) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    value: 0,
  }));
  for (const point of data) {
    const d = new Date(point.date);
    if (Number.isNaN(d.getTime())) continue;
    buckets[d.getHours()].value += point.value;
  }
  return buckets;
}

function isDark() {
  return document.documentElement.classList.contains('dark');
}

function HourlyCard({ title, data, loading }: { title: string; data: ReturnType<typeof aggregateByHour>; loading: boolean }) {
  const maxPoint = data.reduce((max, d) => (d.value > max.value ? d : max), data[0]);
  const dark = isDark();
  const gridStroke = dark ? '#3f3f46' : '#f4f4f5';
  const tickFill = dark ? '#71717a' : '#a1a1aa';

  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-5 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{title}</h3>
        {!loading && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Peak: {maxPoint.label}</span>
        )}
      </div>
      <div className="h-48">
        {loading ? (
          <div className="h-full bg-zinc-50 dark:bg-zinc-800 rounded-lg animate-pulse" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: tickFill }}
                tickLine={false}
                axisLine={{ stroke: gridStroke }}
                interval={2}
              />
              <YAxis
                tick={{ fontSize: 10, fill: tickFill }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const point = payload[0].payload as { label: string; value: number };
                  return (
                    <div className="bg-zinc-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg">
                      <p className="text-zinc-400 mb-0.5">{point.label}</p>
                      <p className="font-medium">{point.value.toLocaleString()}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function InsightsPage({ siteId, client, period, onPeriodChange }: InsightsPageProps) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filters, setFilters] = useState<SegmentFilter[]>([]);
  const filterMap = useMemo(() => filtersToRecord(filters), [filters]);

  const statsOptions = period === 'custom' && dateFrom && dateTo
    ? { period, dateFrom: new Date(dateFrom).toISOString(), dateTo: new Date(dateTo + 'T23:59:59').toISOString() }
    : { period };

  const { data: insightsData, isLoading: loadingLists, error } = useQuery({
    queryKey: queryKeys.insights(siteId, period, dateFrom, dateTo, filterMap),
    queryFn: async () => {
      client.setSiteId(siteId);
      const withFilters = { ...statsOptions, filters: filterMap };
      const results = await Promise.all(
        insightMetrics.map((m) => client.getStats(m.metric, { ...withFilters, limit: 10 }))
      );
      const map: Record<string, QueryResult> = {};
      insightMetrics.forEach((m, i) => {
        map[m.metric] = results[i];
      });
      return map;
    },
    enabled: period !== 'custom' || (!!dateFrom && !!dateTo),
  });

  const { data: hourlyData, isLoading: loadingHourly } = useQuery({
    queryKey: queryKeys.insightsHourly(siteId, period, dateFrom, dateTo, filterMap),
    queryFn: async () => {
      client.setSiteId(siteId);
      const withFilters = { ...statsOptions, filters: filterMap, granularity: 'hour' as const };
      const [eventsSeries, conversionsSeries] = await Promise.all([
        client.getTimeSeries('events', withFilters),
        client.getTimeSeries('conversions', withFilters),
      ]);
      return { events: eventsSeries.data, conversions: conversionsSeries.data };
    },
    enabled: period !== 'custom' || (!!dateFrom && !!dateTo),
  });

  const hourlyEvents = useMemo(
    () => aggregateByHour(hourlyData?.events ?? []),
    [hourlyData?.events],
  );
  const hourlyConversions = useMemo(
    () => aggregateByHour(hourlyData?.conversions ?? []),
    [hourlyData?.conversions],
  );

  return (
    <>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <PeriodSelector
          value={period}
          onChange={onPeriodChange}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
        />
      </div>

      <SegmentFilters value={filters} onChange={setFilters} />

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
          {error instanceof Error ? error.message : 'Failed to fetch insights'}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <HourlyCard title="Busy Hours (Events)" data={hourlyEvents} loading={loadingHourly} />
        <HourlyCard title="Conversion Hours" data={hourlyConversions} loading={loadingHourly} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {insightMetrics.map((metric) => (
          <TopList
            key={metric.metric}
            title={metric.title}
            data={insightsData?.[metric.metric]?.data ?? null}
            loading={loadingLists}
          />
        ))}
      </div>
    </>
  );
}
