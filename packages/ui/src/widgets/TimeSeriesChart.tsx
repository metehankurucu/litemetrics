import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { Period, TimeSeriesPoint } from '@litemetrics/core';
import type { ChartMetric } from '../types';
import { useTimeSeries } from '../hooks/useTimeSeries';
import { useLitemetricsUI } from '../hooks/useLitemetricsUI';
import { useThemeColors } from '../hooks/useThemeColors';
import { formatDate, formatTooltipDate } from '../utils/formatters';

const metrics: { value: ChartMetric; label: string }[] = [
  { value: 'pageviews', label: 'Pageviews' },
  { value: 'visitors', label: 'Visitors' },
  { value: 'sessions', label: 'Sessions' },
];

interface TimeSeriesChartProps {
  defaultMetric?: ChartMetric;
  period?: Period;
  className?: string;
}

export function TimeSeriesChart({ defaultMetric = 'pageviews', period: periodProp, className }: TimeSeriesChartProps) {
  const [metric, setMetric] = useState<ChartMetric>(defaultMetric);
  const { period: ctxPeriod } = useLitemetricsUI();
  const period = periodProp ?? ctxPeriod;
  const { get } = useThemeColors();

  const { data: result, isLoading: loading } = useTimeSeries(metric, { period });
  const data = result?.data ?? [];

  const strokeColor = get('--lm-chart-stroke', '99 102 241');
  const fillColor = get('--lm-chart-fill', '99 102 241');
  const gridColor = get('--lm-chart-grid', '244 244 245');
  const axisColor = get('--lm-chart-axis', '161 161 170');

  return (
    <div className={`rounded-xl bg-[rgb(var(--lm-bg))] border border-[rgb(var(--lm-border))] p-6 ${className ?? ''}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[rgb(var(--lm-text-secondary))]">Overview</h3>
        <div className="flex gap-1">
          {metrics.map((m) => (
            <button
              key={m.value}
              onClick={() => setMetric(m.value)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                metric === m.value
                  ? 'bg-[rgb(var(--lm-accent-light))] text-[rgb(var(--lm-accent-text))] font-medium'
                  : 'text-[rgb(var(--lm-text-tertiary))] hover:text-[rgb(var(--lm-text-secondary))]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        {loading ? (
          <div className="h-full bg-[rgb(var(--lm-bg-secondary))] rounded-lg animate-pulse" />
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[rgb(var(--lm-text-tertiary))] text-sm">
            No data for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="lm-chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={fillColor} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={fillColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatDate(v, period)}
                tick={{ fontSize: 11, fill: axisColor }}
                tickLine={false}
                axisLine={{ stroke: gridColor }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 11, fill: axisColor }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const point = payload[0].payload as TimeSeriesPoint;
                  return (
                    <div className="bg-[rgb(var(--lm-tooltip-bg))] text-[rgb(var(--lm-tooltip-text))] text-xs rounded-lg px-3 py-2 shadow-lg">
                      <p className="text-[rgb(var(--lm-tooltip-muted))] mb-0.5">{formatTooltipDate(point.date, period)}</p>
                      <p className="font-medium">{point.value.toLocaleString()} {metric}</p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={strokeColor}
                strokeWidth={2}
                fill="url(#lm-chartGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
