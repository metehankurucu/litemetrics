import { useState } from 'react';
import type { QueryDataPoint } from '@litemetrics/client';
import { getBrowserIcon, getOSIcon, getDeviceIcon, getReferrerIcon, countryToFlag } from './icons';

export type TopListType = 'pages' | 'referrers' | 'countries' | 'events' | 'conversions' | 'browsers' | 'devices';

interface TopListProps {
  title: string;
  data: QueryDataPoint[] | null;
  loading?: boolean;
  type?: TopListType;
}

function getIcon(type: TopListType | undefined, key: string): React.ReactNode {
  if (!type) return null;
  switch (type) {
    case 'pages':
      return (
        <svg className="w-4 h-4 flex-shrink-0 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'referrers':
      return getReferrerIcon(key);
    case 'countries': {
      const flag = countryToFlag(key);
      return flag ? <span className="text-sm flex-shrink-0 leading-none">{flag}</span> : null;
    }
    case 'events':
      return (
        <svg className="w-4 h-4 flex-shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
    case 'conversions':
      return (
        <svg className="w-4 h-4 flex-shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'browsers':
      return getBrowserIcon(key);
    case 'devices':
      return getDeviceIcon(key);
  }
}

export function TopList({ title, data, loading, type }: TopListProps) {
  const [tooltip, setTooltip] = useState<{ key: string; value: number; pct: number; x: number; y: number } | null>(null);
  const maxValue = data ? Math.max(...data.map((d) => d.value), 1) : 1;
  const totalValue = data ? data.reduce((sum, d) => sum + d.value, 0) : 0;

  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-5 h-full flex flex-col hover:shadow-md transition-all duration-200">
      <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-4">{title}</h3>
      {loading ? (
        <div className="space-y-2.5 flex-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-zinc-50 dark:bg-zinc-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8">
          <p className="text-zinc-300 dark:text-zinc-600 text-sm">No data yet</p>
        </div>
      ) : (
        <div className="space-y-1 flex-1">
          {data.map((item) => {
            const pct = totalValue > 0 ? Math.round((item.value / totalValue) * 100) : 0;
            const icon = getIcon(type, item.key);
            return (
              <div
                key={item.key}
                className="relative group"
                onMouseEnter={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setTooltip({ key: item.key, value: item.value, pct, x: rect.left + rect.width / 2, y: rect.top });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                <div
                  className="absolute inset-0 bg-indigo-50/80 dark:bg-indigo-500/10 rounded-lg transition-all group-hover:bg-indigo-100/80 dark:group-hover:bg-indigo-500/20"
                  style={{ width: `${(item.value / maxValue) * 100}%` }}
                />
                <div className="relative flex items-center justify-between px-2.5 py-2 text-sm">
                  <div className="flex items-center gap-2 truncate mr-3">
                    {icon}
                    <span className="truncate text-zinc-700 dark:text-zinc-300 font-medium">{item.key || '(direct)'}</span>
                  </div>
                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <span className="text-zinc-600 dark:text-zinc-400 tabular-nums text-xs font-semibold">
                      {item.value.toLocaleString()}
                    </span>
                    <span className="text-zinc-400 dark:text-zinc-500 tabular-nums text-xs w-8 text-right">
                      {pct}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tooltip && (
        <div
          className="fixed z-50 bg-zinc-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none max-w-xs"
          style={{ left: tooltip.x, top: tooltip.y - 8, transform: 'translate(-50%, -100%)' }}
        >
          <p className="font-medium break-all">{tooltip.key || '(direct)'}</p>
          <p className="text-zinc-400 mt-0.5">{tooltip.value.toLocaleString()} &middot; {tooltip.pct}%</p>
        </div>
      )}
    </div>
  );
}
