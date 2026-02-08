import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Period, LitemetricsClient, Metric } from '@litemetrics/client';
import { queryKeys } from '../hooks/useAnalytics';
import { TopList, type TopListType } from '../components/TopList';
import { PieChartCard } from '../components/PieChartCard';
import { PeriodSelector } from '../components/PeriodSelector';
import { ExportButton } from '../components/ExportButton';
import { SegmentFilters, type SegmentFilter, filtersToRecord } from '../components/SegmentFilters';
import { RefreshCw } from 'lucide-react';

type CampaignTab = 'channels' | 'sources' | 'mediums' | 'campaigns' | 'terms' | 'contents';

const tabs: { id: CampaignTab; label: string; metric: Metric; type: TopListType }[] = [
  { id: 'channels', label: 'Channels', metric: 'top_channels', type: 'channels' },
  { id: 'sources', label: 'Sources', metric: 'top_utm_sources', type: 'utm_sources' },
  { id: 'mediums', label: 'Mediums', metric: 'top_utm_mediums', type: 'utm_mediums' },
  { id: 'campaigns', label: 'Campaigns', metric: 'top_utm_campaigns', type: 'utm_campaigns' },
  { id: 'terms', label: 'Terms', metric: 'top_utm_terms', type: 'utm_terms' },
  { id: 'contents', label: 'Content', metric: 'top_utm_contents', type: 'utm_contents' },
];

interface CampaignsPageProps {
  siteId: string;
  client: LitemetricsClient;
  period: Period;
  onPeriodChange: (p: Period) => void;
}

export function CampaignsPage({ siteId, client, period, onPeriodChange }: CampaignsPageProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<CampaignTab>('channels');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filters, setFilters] = useState<SegmentFilter[]>([]);
  const filterMap = useMemo(() => filtersToRecord(filters), [filters]);

  const statsOptions = period === 'custom' && dateFrom && dateTo
    ? { period, dateFrom: new Date(dateFrom).toISOString(), dateTo: new Date(dateTo + 'T23:59:59').toISOString() }
    : { period };

  const activeTabConfig = tabs.find((t) => t.id === activeTab)!;

  const { data, isLoading: loading, error } = useQuery({
    queryKey: queryKeys.campaigns(siteId, period, activeTab, dateFrom, dateTo, filterMap),
    queryFn: async () => {
      client.setSiteId(siteId);
      const result = await client.getStats(activeTabConfig.metric, {
        ...statsOptions,
        filters: filterMap,
        limit: 20,
      });
      return result;
    },
    enabled: period !== 'custom' || (!!dateFrom && !!dateTo),
  });

  const listData = data?.data ?? null;
  const pieData = (listData ?? []).map((d) => ({ name: d.key || '(none)', value: d.value }));

  const exportData = (listData ?? []).map((d) => ({
    metric: activeTabConfig.metric,
    key: d.key,
    value: d.value,
  }));

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
          <ExportButton data={exportData} filename={`campaigns-${siteId}-${activeTab}-${period}`} />
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.campaigns(siteId, period, activeTab, dateFrom, dateTo, filterMap) })}
            className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow transition-all"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <SegmentFilters value={filters} onChange={setFilters} />

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
          {error instanceof Error ? error.message : 'Failed to fetch campaign data'}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg p-1 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'channels' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <PieChartCard
            title="Channel Distribution"
            data={pieData}
            loading={loading}
          />
          <TopList
            title="Channels"
            type="channels"
            data={listData}
            loading={loading}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <TopList
            title={activeTabConfig.label}
            type={activeTabConfig.type}
            data={listData}
            loading={loading}
          />
          <PieChartCard
            title={`${activeTabConfig.label} Distribution`}
            data={pieData}
            loading={loading}
          />
        </div>
      )}
    </>
  );
}
