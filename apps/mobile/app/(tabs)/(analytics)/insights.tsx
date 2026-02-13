import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { TrendingUp, LogOut, ArrowLeft, ArrowRightLeft, ScrollText, MousePointer, Link2 } from 'lucide-react-native';
import { useAuthStore } from 'src/stores/auth-store';
import { useUIStore } from 'src/stores/ui-store';
import { useInsights, useInsightsHourly } from 'src/api/hooks/useInsights';
import { Header } from 'src/components/common/Header';
import { SiteSelector } from 'src/components/common/SiteSelector';
import { PeriodSelector } from 'src/components/common/PeriodSelector';
import { TopList } from 'src/components/charts/TopList';
import { LoadingState } from 'src/components/common/LoadingState';
import { EmptyState } from 'src/components/common/EmptyState';
import { BarChart } from 'react-native-gifted-charts';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';

function aggregateByHour(data: { date: string; value: number }[]): { label: string; value: number }[] {
  const hours = new Array(24).fill(0);
  for (const point of data) {
    const hour = new Date(point.date).getHours();
    hours[hour] += point.value;
  }
  return hours.map((value, i) => ({
    label: `${i.toString().padStart(2, '0')}`,
    value,
  }));
}

function HourlyChart({ title, data, color }: { title: string; data: { date: string; value: number }[]; color: string }) {
  const hourly = aggregateByHour(data);
  const maxVal = Math.max(...hourly.map(h => h.value), 1);
  const peakHour = hourly.reduce((max, h) => h.value > max.value ? h : max, hourly[0]);

  const barData = hourly.map(h => ({
    value: h.value,
    label: h.label,
    frontColor: h.label === peakHour.label ? color : color + '60',
    labelTextStyle: { fontSize: 8, color: '#94a3b8' },
  }));

  return (
    <View style={{
      backgroundColor: '#fff', borderRadius: 14, ...continuousRadius(),
      padding: 16, ...cardShadow(),
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: '#0f172a' }}>{title}</Text>
        <Text style={{ fontSize: 12, color: '#94a3b8' }}>Peak: {peakHour.label}:00</Text>
      </View>
      <BarChart
        data={barData}
        barWidth={8}
        spacing={4}
        hideRules
        xAxisThickness={0}
        yAxisThickness={0}
        yAxisTextStyle={{ fontSize: 10, color: '#94a3b8' }}
        noOfSections={4}
        maxValue={maxVal}
        height={120}
        barBorderRadius={3}
        isAnimated
      />
    </View>
  );
}

export default function InsightsScreen() {
  const { activeSiteId, setActiveSite } = useAuthStore();
  const router = useRouter();
  const { period } = useUIStore();
  const { data: insights, isLoading } = useInsights(period);
  const { data: hourly } = useInsightsHourly(period);
  const backButton = (
    <Pressable
      onPress={() => router.push('/(tabs)/(analytics)/')}
      hitSlop={8}
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        ...continuousRadius(),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#e2e8f0',
      }}
    >
      <ArrowLeft size={18} color="#334155" />
    </Pressable>
  );

  if (!activeSiteId) {
    return (
      <>
        <Header title="Insights" leftElement={backButton} rightElement={<SiteSelector onSiteChange={setActiveSite} />} />
        <EmptyState icon={TrendingUp} title="No Site Selected" />
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <Header title="Insights" leftElement={backButton} rightElement={<SiteSelector onSiteChange={setActiveSite} />} />
        <LoadingState message="Loading insights..." />
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <Header title="Insights" leftElement={backButton} rightElement={<SiteSelector onSiteChange={setActiveSite} />} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
      >
        <PeriodSelector />

        {/* Hourly Charts */}
        {hourly?.events?.data && hourly.events.data.length > 0 && (
          <HourlyChart title="Busy Hours (Events)" data={hourly.events.data} color="#6366f1" />
        )}
        {hourly?.conversions?.data && hourly.conversions.data.length > 0 && (
          <HourlyChart title="Conversion Hours" data={hourly.conversions.data} color="#10b981" />
        )}

        {/* Insight TopLists */}
        {insights && (
          <View style={{ gap: 12 }}>
            {Array.isArray(insights.exitPages?.data) && insights.exitPages.data.length > 0 && (
              <TopList title="Exit Pages" data={insights.exitPages.data} unit="exits" icon={LogOut} />
            )}
            {Array.isArray(insights.transitions?.data) && insights.transitions.data.length > 0 && (
              <TopList title="Top Transitions" data={insights.transitions.data} unit="transitions" icon={ArrowRightLeft} />
            )}
            {Array.isArray(insights.scrollPages?.data) && insights.scrollPages.data.length > 0 && (
              <TopList title="Most Scrolled Pages" data={insights.scrollPages.data} unit="scrolls" icon={ScrollText} />
            )}
            {Array.isArray(insights.buttonClicks?.data) && insights.buttonClicks.data.length > 0 && (
              <TopList title="Top Button Clicks" data={insights.buttonClicks.data} unit="clicks" icon={MousePointer} />
            )}
            {Array.isArray(insights.linkTargets?.data) && insights.linkTargets.data.length > 0 && (
              <TopList title="Top Link Targets" data={insights.linkTargets.data} unit="clicks" icon={Link2} />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
