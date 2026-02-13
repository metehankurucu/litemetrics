import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';
import { useState, useMemo } from 'react';
import {
  Eye, Users, Monitor, Zap, TrendingUp, FileText, Link2,
  Globe, Smartphone, Compass, Target, Cpu,
  Layers, AppWindow, TabletSmartphone, Share2,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from 'src/stores/auth-store';
import { useUIStore } from 'src/stores/ui-store';
import { useOverview, useTimeSeries, useTopMetrics, useLiveVisitors } from 'src/api/hooks/useAnalytics';
import { useSite } from 'src/api/hooks/useSites';
import { Header } from 'src/components/common/Header';
import { SiteSelector } from 'src/components/common/SiteSelector';
import { PeriodSelector } from 'src/components/common/PeriodSelector';
import { AnalyticsSectionNav } from 'src/components/common/AnalyticsSectionNav';
import { SegmentFilters } from 'src/components/common/SegmentFilters';
import { StatCard } from 'src/components/common/StatCard';
import { TimeSeriesChart } from 'src/components/charts/TimeSeriesChart';
import { TopList } from 'src/components/charts/TopList';
import { PieChartCard } from 'src/components/charts/PieChartCard';
import { LoadingState } from 'src/components/common/LoadingState';
import { EmptyState } from 'src/components/common/EmptyState';
import { exportCSV } from 'src/lib/export';

export default function AnalyticsScreen() {
  const { activeSiteId, setActiveSite } = useAuthStore();
  const { period, dateFrom, dateTo } = useUIStore();
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<{ key: string; value: string }[]>([]);

  const filtersRecord = useMemo(() => {
    const record: Record<string, string> = {};
    for (const f of filters) {
      if (f.value.trim()) record[f.key] = f.value.trim();
    }
    return Object.keys(record).length > 0 ? record : undefined;
  }, [filters]);

  const dateRange = period === 'custom' && dateFrom && dateTo ? { dateFrom, dateTo } : undefined;

  const { data: site } = useSite(activeSiteId);
  const isApp = site?.type === 'app';

  const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } = useOverview(period, filtersRecord, dateRange);
  const { data: timeSeries } = useTimeSeries('visitors', period, filtersRecord, dateRange);
  const { data: topMetrics } = useTopMetrics(period, site?.type, filtersRecord, dateRange);
  const { data: liveCount } = useLiveVisitors();

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchOverview();
    setRefreshing(false);
  };

  const handleExport = () => {
    if (!overview) return;
    const data = [
      { metric: isApp ? 'Screen Views' : 'Pageviews', total: overview.pageviews?.total ?? 0, change: overview.pageviews?.changePercent ?? '' },
      { metric: 'Visitors', total: overview.visitors?.total ?? 0, change: overview.visitors?.changePercent ?? '' },
      { metric: 'Sessions', total: overview.sessions?.total ?? 0, change: overview.sessions?.changePercent ?? '' },
      { metric: 'Events', total: overview.events?.total ?? 0, change: overview.events?.changePercent ?? '' },
      { metric: 'Conversions', total: overview.conversions?.total ?? 0, change: overview.conversions?.changePercent ?? '' },
    ];
    exportCSV(data, `analytics_${period}`);
  };

  if (!activeSiteId) {
    return (
      <>
        <Header title="Analytics" rightElement={<SiteSelector onSiteChange={setActiveSite} />} />
        <EmptyState icon={Eye} title="No Site Selected" description="Please select a site from the header" />
      </>
    );
  }

  if (overviewLoading) {
    return (
      <>
        <Header title="Analytics" rightElement={<SiteSelector onSiteChange={setActiveSite} />} />
        <LoadingState message="Loading analytics..." />
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <Header
        title="Analytics"
        rightElement={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <SiteSelector onSiteChange={setActiveSite} />
            <Pressable onPress={handleExport} hitSlop={8}>
              <Share2 size={20} color="#64748b" />
            </Pressable>
          </View>
        }
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={{ gap: 6 }}>
          <AnalyticsSectionNav active="index" />
          <PeriodSelector />
        </View>

        <SegmentFilters filters={filters} onChange={setFilters} />

        {/* Live Visitor Indicator */}
        {liveCount !== undefined && liveCount > 0 && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
            backgroundColor: '#f0fdf4', borderRadius: 20,
            paddingHorizontal: 12, paddingVertical: 6, gap: 6,
          }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' }} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#16a34a', fontVariant: ['tabular-nums'] }}>
              {liveCount} active now
            </Text>
          </View>
        )}

        {overview && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
            <View style={{ width: '48%' }}>
              <StatCard
                title={isApp ? 'Screen Views' : 'Pageviews'}
                value={overview.pageviews?.total ?? 0}
                change={overview.pageviews?.changePercent}
                icon={Eye}
                iconColor="#8b5cf6"
              />
            </View>
            <View style={{ width: '48%' }}>
              <StatCard
                title="Visitors"
                value={overview.visitors?.total ?? 0}
                change={overview.visitors?.changePercent}
                icon={Users}
                iconColor="#0ea5e9"
              />
            </View>
            <View style={{ width: '48%' }}>
              <StatCard
                title="Sessions"
                value={overview.sessions?.total ?? 0}
                change={overview.sessions?.changePercent}
                icon={Monitor}
                iconColor="#10b981"
              />
            </View>
            <View style={{ width: '48%' }}>
              <StatCard
                title="Events"
                value={overview.events?.total ?? 0}
                change={overview.events?.changePercent}
                icon={Zap}
                iconColor="#f59e0b"
              />
            </View>
            <View style={{ width: '48%' }}>
              <StatCard
                title="Conversions"
                value={overview.conversions?.total ?? 0}
                change={overview.conversions?.changePercent}
                icon={Target}
                iconColor="#ec4899"
              />
            </View>
            <View style={{ width: '48%' }}>
              <StatCard
                title="Views / Visit"
                value={overview.sessions?.total ? (overview.pageviews?.total / overview.sessions.total).toFixed(1) : '0'}
                icon={TrendingUp}
                iconColor="#6366f1"
              />
            </View>
          </View>
        )}

        {/* Conversion Warning */}
        {site && (!site.conversionEvents || site.conversionEvents.length === 0) && (
          <View style={{
            backgroundColor: '#fffbeb', borderRadius: 12, ...continuousRadius(),
            borderWidth: 1, borderColor: '#fde68a', padding: 12,
          }}>
            <Text style={{ fontSize: 13, color: '#b45309' }}>
              No conversion events configured. Add event names in Site Settings to track conversions.
            </Text>
          </View>
        )}

        {timeSeries && Array.isArray(timeSeries.data) && timeSeries.data.length > 0 && (
          <TimeSeriesChart data={timeSeries.data} title="Visitors Over Time" color="#0ea5e9" icon={TrendingUp} />
        )}

        {topMetrics && (
          <View style={{ gap: 12 }}>
            {/* Pages / Screens */}
            {Array.isArray(topMetrics.topPages?.data) && topMetrics.topPages.data.length > 0 && (
              <TopList
                title={isApp ? 'Top Screens' : 'Top Pages'}
                data={topMetrics.topPages.data}
                unit="views"
                icon={FileText}
              />
            )}

            {/* Web only: Referrers */}
            {!isApp && Array.isArray(topMetrics.topReferrers?.data) && topMetrics.topReferrers.data.length > 0 && (
              <TopList title="Top Referrers" data={topMetrics.topReferrers.data} unit="visits" icon={Link2} />
            )}

            {/* Countries */}
            {Array.isArray(topMetrics.topCountries?.data) && topMetrics.topCountries.data.length > 0 && (
              <PieChartCard title="Countries" data={topMetrics.topCountries.data} icon={Globe} />
            )}

            {/* Events */}
            {Array.isArray(topMetrics.topEvents?.data) && topMetrics.topEvents.data.length > 0 && (
              <TopList title="Top Events" data={topMetrics.topEvents.data} unit="events" icon={Zap} />
            )}

            {/* Conversions */}
            {Array.isArray(topMetrics.topConversions?.data) && topMetrics.topConversions.data.length > 0 && (
              <TopList title="Top Conversions" data={topMetrics.topConversions.data} unit="conversions" icon={Target} />
            )}

            {/* Web: Browsers + Devices pie charts */}
            {!isApp && (
              <>
                {Array.isArray(topMetrics.topBrowsers?.data) && topMetrics.topBrowsers.data.length > 0 && (
                  <PieChartCard title="Browsers" data={topMetrics.topBrowsers.data} icon={Compass} />
                )}
                {Array.isArray(topMetrics.topDevices?.data) && topMetrics.topDevices.data.length > 0 && (
                  <PieChartCard title="Devices" data={topMetrics.topDevices.data} icon={Smartphone} />
                )}
              </>
            )}

            {/* App: OS + App Versions pie charts */}
            {isApp && (
              <>
                {Array.isArray(topMetrics.topOS?.data) && topMetrics.topOS.data.length > 0 && (
                  <PieChartCard title="Operating Systems" data={topMetrics.topOS.data} icon={Cpu} />
                )}
                {Array.isArray(topMetrics.topAppVersions?.data) && topMetrics.topAppVersions.data.length > 0 && (
                  <PieChartCard title="App Versions" data={topMetrics.topAppVersions.data} icon={AppWindow} />
                )}
              </>
            )}

            {/* App: additional top lists */}
            {isApp && (
              <>
                {Array.isArray(topMetrics.topOSVersions?.data) && topMetrics.topOSVersions.data.length > 0 && (
                  <TopList title="OS Versions" data={topMetrics.topOSVersions.data} unit="visits" icon={Layers} />
                )}
                {Array.isArray(topMetrics.topDeviceModels?.data) && topMetrics.topDeviceModels.data.length > 0 && (
                  <TopList title="Device Models" data={topMetrics.topDeviceModels.data} unit="visits" icon={TabletSmartphone} />
                )}
              </>
            )}

            {/* Web: Browser top list */}
            {!isApp && Array.isArray(topMetrics.topBrowsers?.data) && topMetrics.topBrowsers.data.length > 0 && (
              <TopList title="Top Browsers" data={topMetrics.topBrowsers.data} unit="visits" icon={Compass} />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
