import { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { InsaytClient, Period, TimeSeriesPoint } from '@insayt/client';

interface TimeSeriesChartProps {
  client: InsaytClient;
  siteId: string;
  period: Period;
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

export function TimeSeriesChart({ client, siteId, period }: TimeSeriesChartProps) {
  const [metric, setMetric] = useState<ChartMetric>('pageviews');
  const [data, setData] = useState<TimeSeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    client.setSiteId(siteId);
    try {
      const result = await client.getTimeSeries(metric, { period });
      setData(result.data);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [client, siteId, period, metric]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="rounded-xl bg-white border border-zinc-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-zinc-500">Overview</h3>
        <div className="flex gap-1">
          {metrics.map((m) => (
            <button
              key={m.value}
              onClick={() => setMetric(m.value)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                metric === m.value
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-zinc-400 hover:text-zinc-600'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        {loading ? (
          <div className="h-full bg-zinc-50 rounded-lg animate-pulse" />
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-400 text-sm">
            No data for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatDate(v, period)}
                tick={{ fontSize: 11, fill: '#a1a1aa' }}
                tickLine={false}
                axisLine={{ stroke: '#f4f4f5' }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#a1a1aa' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const point = payload[0].payload as TimeSeriesPoint;
                  return (
                    <div className="bg-zinc-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg">
                      <p className="text-zinc-400 mb-0.5">{formatTooltipDate(point.date, period)}</p>
                      <p className="font-medium">{point.value.toLocaleString()} {metric}</p>
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
