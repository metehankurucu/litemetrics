import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LitemetricsClient, Period } from '@litemetrics/client';
import { queryKeys } from '../hooks/useAnalytics';
import { PeriodSelector } from '../components/PeriodSelector';
import { ExportButton } from '../components/ExportButton';
import { RefreshCw, Users } from 'lucide-react';

interface RetentionPageProps {
  siteId: string;
  client: LitemetricsClient;
}

export function RetentionPage({ siteId, client }: RetentionPageProps) {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>('90d');
  const [weeks, setWeeks] = useState(8);

  const { data: cohorts = [], isLoading: loading, error } = useQuery({
    queryKey: queryKeys.retention(siteId, period, weeks),
    queryFn: async () => {
      client.setSiteId(siteId);
      const result = await client.getRetention({ period, weeks });
      return result.cohorts;
    },
  });

  // Max retention columns across all cohorts
  const maxCols = cohorts.reduce((max, c) => Math.max(max, c.retention.length), 0);

  // Build export data
  const exportData = cohorts.map((c) => {
    const row: Record<string, unknown> = { week: c.week, cohort_size: c.size };
    c.retention.forEach((r, i) => {
      row[`week_${i}`] = `${r.toFixed(1)}%`;
    });
    return row;
  });

  return (
    <>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <PeriodSelector
            value={period}
            onChange={setPeriod}
          />
          <select
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm dark:text-zinc-200"
          >
            {[4, 6, 8, 10, 12].map((w) => (
              <option key={w} value={w}>{w} weeks</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton data={exportData} filename={`retention-${siteId}-${period}`} />
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.retention(siteId, period, weeks) })}
            className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow transition-all"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
          {error instanceof Error ? error.message : 'Failed to fetch retention'}
        </div>
      )}

      <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm overflow-x-auto">
        <div className="flex items-center gap-1.5 px-5 pt-4 pb-2">
          <span className="text-zinc-400 dark:text-zinc-500"><Users className="w-3.5 h-3.5" /></span>
          <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Cohort Retention</h3>
        </div>
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
            ))}
          </div>
        ) : cohorts.length === 0 ? (
          <div className="p-12 text-center text-zinc-400 dark:text-zinc-500 text-sm">
            Not enough data for retention analysis
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider sticky left-0 bg-zinc-50/50 dark:bg-zinc-800/50">
                  Cohort
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                  Users
                </th>
                {[...Array(maxCols)].map((_, i) => (
                  <th key={i} className="px-3 py-3 text-center text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider min-w-[60px]">
                    {i === 0 ? 'Wk 0' : `Wk ${i}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort) => (
                <tr key={cohort.week} className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50/30 dark:hover:bg-zinc-800/30">
                  <td className="px-4 py-2.5 font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap sticky left-0 bg-white dark:bg-zinc-900">
                    {formatWeek(cohort.week)}
                  </td>
                  <td className="px-4 py-2.5 text-center text-zinc-600 dark:text-zinc-400 tabular-nums">
                    {cohort.size.toLocaleString()}
                  </td>
                  {[...Array(maxCols)].map((_, i) => {
                    const value = cohort.retention[i];
                    if (value === undefined) {
                      return <td key={i} className="px-3 py-2.5" />;
                    }
                    return (
                      <td key={i} className="px-3 py-2.5 text-center">
                        <div
                          className="rounded-md px-2 py-1 text-xs font-medium tabular-nums"
                          style={{
                            backgroundColor: getHeatmapColor(value),
                            color: value > 50 ? '#fff' : '#374151',
                          }}
                        >
                          {value.toFixed(1)}%
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      {cohorts.length > 0 && (
        <div className="mt-4 flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
          <span>Low</span>
          <div className="flex">
            {[0, 20, 40, 60, 80, 100].map((v) => (
              <div
                key={v}
                className="w-6 h-4 first:rounded-l last:rounded-r"
                style={{ backgroundColor: getHeatmapColor(v) }}
              />
            ))}
          </div>
          <span>High</span>
        </div>
      )}
    </>
  );
}

function formatWeek(isoWeek: string): string {
  // isoWeek format: "2025-W03" or "2025-01-20"
  if (isoWeek.includes('W')) {
    return isoWeek;
  }
  // Parse as date
  const d = new Date(isoWeek);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getHeatmapColor(percentage: number): string {
  // 0% = very light, 100% = deep indigo
  const clamped = Math.max(0, Math.min(100, percentage));
  if (clamped === 0) return '#f4f4f5'; // zinc-100

  // Gradient from light indigo to deep indigo
  const intensity = clamped / 100;
  const r = Math.round(224 - intensity * 155); // 224 -> 69
  const g = Math.round(231 - intensity * 131); // 231 -> 100
  const b = Math.round(255 - intensity * 9);   // 255 -> 246
  return `rgb(${r}, ${g}, ${b})`;
}
