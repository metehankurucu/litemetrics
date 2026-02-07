import { useState, useEffect, useCallback } from 'react';
import type { LitemetricsClient, RetentionCohort, Period } from '@litemetrics/client';
import { PeriodSelector } from '../components/PeriodSelector';
import { ExportButton } from '../components/ExportButton';

interface RetentionPageProps {
  siteId: string;
  client: LitemetricsClient;
}

export function RetentionPage({ siteId, client }: RetentionPageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cohorts, setCohorts] = useState<RetentionCohort[]>([]);
  const [period, setPeriod] = useState<Period>('90d');
  const [weeks, setWeeks] = useState(8);

  const fetchRetention = useCallback(async () => {
    setLoading(true);
    setError(null);
    client.setSiteId(siteId);

    try {
      const result = await client.getRetention({ period, weeks });
      setCohorts(result.cohorts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch retention');
    } finally {
      setLoading(false);
    }
  }, [client, siteId, period, weeks]);

  useEffect(() => {
    fetchRetention();
  }, [fetchRetention]);

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
            className="bg-white border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
          >
            {[4, 6, 8, 10, 12].map((w) => (
              <option key={w} value={w}>{w} weeks</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton data={exportData} filename={`retention-${siteId}-${period}`} />
          <button
            onClick={fetchRetention}
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

      <div className="rounded-xl bg-white border border-zinc-200 overflow-x-auto">
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-zinc-100 rounded animate-pulse" />
            ))}
          </div>
        ) : cohorts.length === 0 ? (
          <div className="p-12 text-center text-zinc-400 text-sm">
            Not enough data for retention analysis
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase sticky left-0 bg-white">
                  Cohort
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-zinc-400 uppercase">
                  Users
                </th>
                {[...Array(maxCols)].map((_, i) => (
                  <th key={i} className="px-3 py-3 text-center text-xs font-medium text-zinc-400 uppercase min-w-[60px]">
                    {i === 0 ? 'Wk 0' : `Wk ${i}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort) => (
                <tr key={cohort.week} className="border-b border-zinc-50 hover:bg-zinc-50/30">
                  <td className="px-4 py-2.5 font-medium text-zinc-700 whitespace-nowrap sticky left-0 bg-white">
                    {formatWeek(cohort.week)}
                  </td>
                  <td className="px-4 py-2.5 text-center text-zinc-600 tabular-nums">
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
        <div className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
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
