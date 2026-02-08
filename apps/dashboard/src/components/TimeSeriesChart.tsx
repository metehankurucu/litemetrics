import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { LitemetricsClient, Period, TimeSeriesPoint } from '@litemetrics/client';
import { queryKeys } from '../hooks/useAnalytics';
import { BarChart3 } from 'lucide-react';

interface TimeSeriesChartProps {
  client: LitemetricsClient;
  siteId: string;
  period: Period;
  filters?: Record<string, string>;
}

type ChartMetric = 'pageviews' | 'visitors' | 'sessions';

const metrics: { value: ChartMetric; label: string }[] = [
  { value: 'pageviews', label: 'Pageviews' },
  { value: 'visitors', label: 'Visitors' },
  { value: 'sessions', label: 'Sessions' },
];

function formatDate(iso: string, period: Period): string {
  const d = new Date(iso);
  if (period === '1h' || period === '24h') {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatTooltipDate(iso: string, period: Period): string {
  const d = new Date(iso);
  if (period === '1h' || period === '24h') {
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function isDark() {
  return document.documentElement.classList.contains('dark');
}

export function TimeSeriesChart({ client, siteId, period, filters }: TimeSeriesChartProps) {
  const [metric, setMetric] = useState<ChartMetric>('pageviews');

  const { data = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.timeSeries(siteId, period, metric, filters),
    queryFn: async () => {
      client.setSiteId(siteId);
      const result = await client.getTimeSeries(metric, { period, filters });
      return result.data;
    },
  });

  const dark = isDark();
  const gridStroke = dark ? '#27272a' : '#f4f4f5';
  const tickFill = dark ? '#71717a' : '#a1a1aa';
  const axisStroke = dark ? '#27272a' : '#f4f4f5';

  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-5 md:p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Overview</h3>
        </div>
        <div className="inline-flex gap-0.5 bg-zinc-100/80 dark:bg-zinc-800 rounded-lg p-0.5">
          {metrics.map((m) => (
            <button
              key={m.value}
              onClick={() => setMetric(m.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-150 ${
                metric === m.value
                  ? 'bg-white dark:bg-zinc-700 text-indigo-700 dark:text-indigo-400 shadow-sm ring-1 ring-zinc-200/60 dark:ring-zinc-600'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        {loading ? (
          <div className="h-full bg-zinc-50 dark:bg-zinc-800 rounded-lg animate-pulse" />
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-400 text-sm">
            No data for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatDate(v, period)}
                tick={{ fontSize: 11, fill: tickFill }}
                tickLine={false}
                axisLine={{ stroke: axisStroke }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 11, fill: tickFill }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const point = payload[0].payload as TimeSeriesPoint;
                  return (
                    <div className="bg-zinc-900 text-white text-xs rounded-lg px-3 py-2.5 shadow-xl border border-zinc-700/50">
                      <p className="text-zinc-400 mb-1">{formatTooltipDate(point.date, period)}</p>
                      <p className="font-semibold text-sm">{point.value.toLocaleString()} <span className="text-zinc-400 font-normal text-xs">{metric}</span></p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#chartGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
