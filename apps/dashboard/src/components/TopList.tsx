import { useState } from 'react';
import type { QueryDataPoint } from '@litemetrics/client';
import { getBrowserIcon, getOSIcon, getDeviceIcon, getReferrerIcon, getUtmIcon, getUtmMediumIcon, getChannelIcon, getBrowserLabel, countryToFlag, countryToName } from './icons';
import {
  FileText,
  Globe,
  MapPin,
  Zap,
  Target,
  Monitor,
  Smartphone,
  Link2,
  Megaphone,
  Tag,
  Search,
  Radio,
  ChevronDown,
} from 'lucide-react';

export type TopListType = 'pages' | 'referrers' | 'countries' | 'events' | 'conversions' | 'browsers' | 'devices' | 'os' | 'os_versions' | 'device_models' | 'app_versions' | 'utm_sources' | 'utm_mediums' | 'utm_campaigns' | 'utm_terms' | 'utm_contents' | 'channels';

const titleIcons: Record<TopListType, React.ReactNode> = {
  pages: <FileText className="w-3.5 h-3.5" />,
  referrers: <Globe className="w-3.5 h-3.5" />,
  countries: <MapPin className="w-3.5 h-3.5" />,
  events: <Zap className="w-3.5 h-3.5" />,
  conversions: <Target className="w-3.5 h-3.5" />,
  browsers: <Monitor className="w-3.5 h-3.5" />,
  devices: <Smartphone className="w-3.5 h-3.5" />,
  os: <Smartphone className="w-3.5 h-3.5" />,
  os_versions: <Smartphone className="w-3.5 h-3.5" />,
  device_models: <Smartphone className="w-3.5 h-3.5" />,
  app_versions: <Tag className="w-3.5 h-3.5" />,
  utm_sources: <Link2 className="w-3.5 h-3.5" />,
  utm_mediums: <Megaphone className="w-3.5 h-3.5" />,
  utm_campaigns: <Tag className="w-3.5 h-3.5" />,
  utm_terms: <Search className="w-3.5 h-3.5" />,
  utm_contents: <FileText className="w-3.5 h-3.5" />,
  channels: <Radio className="w-3.5 h-3.5" />,
};

interface TopListProps {
  title: string;
  data: QueryDataPoint[] | null;
  loading?: boolean;
  type?: TopListType;
  icon?: React.ReactNode;
  breakdowns?: {
    buttonClicks?: QueryDataPoint[];
    linkTargets?: QueryDataPoint[];
    scrollPages?: QueryDataPoint[];
  };
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
    case 'utm_terms':
      return (
        <svg className="w-4 h-4 flex-shrink-0 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      );
    case 'utm_contents':
      return (
        <svg className="w-4 h-4 flex-shrink-0 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'channels':
      return getChannelIcon(key);
    case 'os':
    case 'os_versions':
      return getOSIcon(key.split(' ')[0]);
    case 'device_models':
      return <Smartphone className="w-4 h-4 flex-shrink-0 text-zinc-400" />;
    case 'app_versions':
      return <Tag className="w-4 h-4 flex-shrink-0 text-indigo-500" />;
  }
}

export function TopList({ title, data, loading, type, icon, breakdowns }: TopListProps) {
  const [tooltip, setTooltip] = useState<{ key: string; value: number; pct: number; x: number; y: number } | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const maxValue = data ? Math.max(...data.map((d) => d.value), 1) : 1;
  const totalValue = data ? data.reduce((sum, d) => sum + d.value, 0) : 0;
  const titleIcon = icon ?? (type ? titleIcons[type] : null);
  const activeBreakdowns = type === 'events' ? breakdowns : undefined;

  const getBreakdownForEvent = (name: string) => {
    if (!activeBreakdowns) return null;
    if (name === 'Button Click') return { data: activeBreakdowns.buttonClicks ?? [] };
    if (name === 'Link Click' || name === 'Outbound Link') return { data: activeBreakdowns.linkTargets ?? [] };
    if (name === 'Scroll Depth') return { data: activeBreakdowns.scrollPages ?? [] };
    return null;
  };

  const formatBreakdownLabel = (value: string) => {
    const cleaned = value.replace(/\s+/g, ' ').trim();
    return cleaned || '(unknown)';
  };

  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 shadow-sm p-5 h-full flex flex-col hover:shadow-md transition-all duration-200">
      <div className="flex items-center gap-1.5 mb-4">
        {titleIcon && <span className="text-zinc-400 dark:text-zinc-500">{titleIcon}</span>}
        <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{title}</h3>
      </div>
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
            const breakdown = getBreakdownForEvent(item.key);
            const isExpandable = !!breakdown;
            const isOpen = expandedKey === item.key;

            return (
              <div key={item.key}>
                <div
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
                    <span className="truncate text-zinc-700 dark:text-zinc-300 font-medium">
                      {type === 'browsers'
                        ? getBrowserLabel(item.key)
                        : type === 'countries'
                          ? countryToName(item.key)
                          : (item.key || '(direct)')}
                    </span>
                    </div>
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      <span className="text-zinc-600 dark:text-zinc-400 tabular-nums text-xs font-semibold">
                        {item.value.toLocaleString()}
                      </span>
                      <span className="text-zinc-400 dark:text-zinc-500 tabular-nums text-xs w-8 text-right">
                        {pct}%
                      </span>
                      {type === 'events' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isExpandable) return;
                            setExpandedKey(isOpen ? null : item.key);
                          }}
                          disabled={!isExpandable}
                          title={isExpandable ? 'Show breakdown' : 'No breakdown available'}
                          className={`p-1 rounded-md border transition-colors ${
                            isExpandable
                              ? 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-600 bg-white/60 dark:bg-zinc-900/60'
                              : 'border-transparent text-zinc-300 dark:text-zinc-700 cursor-not-allowed'
                          }`}
                        >
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-1 mb-2 ml-6 mr-2.5 text-xs">
                    {(() => {
                      const breakdownData = breakdown?.data ?? [];
                      const breakdownTotal = breakdownData.reduce((sum, d) => sum + d.value, 0);
                      const breakdownMax = breakdownData.length > 0 ? Math.max(...breakdownData.map((d) => d.value), 1) : 1;
                      if (breakdownData.length === 0) {
                        return <p className="text-zinc-400 dark:text-zinc-500">No breakdown yet</p>;
                      }
                      return (
                        <div className="space-y-1">
                          {breakdownData.slice(0, 10).map((b) => {
                            const label = formatBreakdownLabel(b.key);
                            const breakdownPct = breakdownTotal > 0 ? Math.round((b.value / breakdownTotal) * 100) : 0;
                            return (
                              <div key={b.key} className="relative group">
                                <div
                                  className="absolute inset-0 bg-indigo-50/70 dark:bg-indigo-500/10 rounded-md transition-all group-hover:bg-indigo-100/70 dark:group-hover:bg-indigo-500/20"
                                  style={{ width: `${(b.value / breakdownMax) * 100}%` }}
                                />
                                <div className="relative flex items-center gap-2 px-2 py-1.5">
                                  <span className="truncate text-zinc-700 dark:text-zinc-300" title={label}>{label}</span>
                                  <span className="ml-auto text-zinc-600 dark:text-zinc-400 tabular-nums text-[11px] font-semibold">
                                    {b.value.toLocaleString()}
                                  </span>
                                  <span className="text-zinc-400 dark:text-zinc-500 tabular-nums text-[11px] w-8 text-right">
                                    {breakdownPct}%
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
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
