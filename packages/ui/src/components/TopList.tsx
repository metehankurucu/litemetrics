import { useState } from 'react';
import type { QueryDataPoint } from '@litemetrics/core';
import type { TopListType } from '../types';
import { getBrowserIcon, getOSIcon, getDeviceIcon, getReferrerIcon, getUtmIcon, getUtmMediumIcon, getBrowserLabel, countryToFlag } from '../utils/icons';

interface TopListProps {
  title: string;
  data: QueryDataPoint[] | null;
  loading?: boolean;
  type?: TopListType;
  className?: string;
}

function getIcon(type: TopListType | undefined, key: string): React.ReactNode {
  if (!type) return null;
  switch (type) {
    case 'pages':
      return (
        <svg className="w-4 h-4 flex-shrink-0 text-[rgb(var(--lm-text-tertiary))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    case 'os':
      return getOSIcon(key);
    case 'devices':
      return getDeviceIcon(key);
    case 'utm_sources':
      return getUtmIcon(key);
    case 'utm_mediums':
      return getUtmMediumIcon(key);
    case 'utm_campaigns':
      return (
        <svg className="w-4 h-4 flex-shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      );
  }
}

export function TopList({ title, data, loading, type, className }: TopListProps) {
  const [tooltip, setTooltip] = useState<{ key: string; value: number; pct: number; x: number; y: number } | null>(null);
  const maxValue = data ? Math.max(...data.map((d) => d.value), 1) : 1;
  const totalValue = data ? data.reduce((sum, d) => sum + d.value, 0) : 0;

  return (
    <div className={`rounded-xl bg-[rgb(var(--lm-bg))] border border-[rgb(var(--lm-border))] p-5 hover:shadow-sm transition-all duration-200 ${className ?? ''}`}>
      <h3 className="text-xs font-medium text-[rgb(var(--lm-text-tertiary))] uppercase tracking-wide mb-4">{title}</h3>
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-7 bg-[rgb(var(--lm-bg-secondary))] rounded animate-pulse" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-[rgb(var(--lm-text-muted))] text-sm">No data yet</p>
        </div>
      ) : (
        <div className="space-y-1">
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
                  className="absolute inset-0 bg-[rgb(var(--lm-bar))] rounded transition-all group-hover:bg-[rgb(var(--lm-bar-hover))]"
                  style={{ width: `${(item.value / maxValue) * 100}%` }}
                />
                <div className="relative flex items-center justify-between px-2.5 py-1.5 text-sm">
                  <div className="flex items-center gap-2 truncate mr-3">
                    {icon}
                    <span className="truncate text-[rgb(var(--lm-text-secondary))]">{type === 'browsers' ? getBrowserLabel(item.key) : (item.key || '(direct)')}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[rgb(var(--lm-text-secondary))] tabular-nums text-xs font-medium">
                      {item.value.toLocaleString()}
                    </span>
                    <span className="text-[rgb(var(--lm-text-tertiary))] tabular-nums text-xs w-8 text-right">
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
          className="fixed z-50 bg-[rgb(var(--lm-tooltip-bg))] text-[rgb(var(--lm-tooltip-text))] text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none max-w-xs"
          style={{ left: tooltip.x, top: tooltip.y - 8, transform: 'translate(-50%, -100%)' }}
        >
          <p className="font-medium break-all">{tooltip.key || '(direct)'}</p>
          <p className="text-[rgb(var(--lm-tooltip-muted))] mt-0.5">{tooltip.value.toLocaleString()} &middot; {tooltip.pct}%</p>
        </div>
      )}
    </div>
  );
}
