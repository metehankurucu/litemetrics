import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ArrowLeft, Megaphone, Hash, ChartBar, FileText, Tag, type LucideIcon } from 'lucide-react-native';
import { useAuthStore } from 'src/stores/auth-store';
import { useUIStore } from 'src/stores/ui-store';
import { useCampaigns } from 'src/api/hooks/useCampaigns';
import { Header } from 'src/components/common/Header';
import { SiteSelector } from 'src/components/common/SiteSelector';
import { PeriodSelector } from 'src/components/common/PeriodSelector';
import { TopList } from 'src/components/charts/TopList';
import { PieChartCard } from 'src/components/charts/PieChartCard';
import { LoadingState } from 'src/components/common/LoadingState';
import { EmptyState } from 'src/components/common/EmptyState';
import type { Metric } from '@litemetrics/core';
import { continuousRadius } from 'src/theme/platform-style';

const TABS: { key: string; label: string; metric: Metric; icon: LucideIcon }[] = [
  { key: 'channels', label: 'Channels', metric: 'top_channels', icon: Megaphone },
  { key: 'sources', label: 'Sources', metric: 'top_utm_sources', icon: ChartBar },
  { key: 'mediums', label: 'Mediums', metric: 'top_utm_mediums', icon: Hash },
  { key: 'campaigns', label: 'Campaigns', metric: 'top_utm_campaigns', icon: Megaphone },
  { key: 'terms', label: 'Terms', metric: 'top_utm_terms', icon: FileText },
  { key: 'content', label: 'Content', metric: 'top_utm_contents', icon: Tag },
];

export default function CampaignsScreen() {
  const { activeSiteId, setActiveSite } = useAuthStore();
  const router = useRouter();
  const { period } = useUIStore();
  const [activeTab, setActiveTab] = useState('channels');
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

  const currentTab = TABS.find(t => t.key === activeTab) ?? TABS[0];
  const { data, isLoading } = useCampaigns(currentTab.metric, period);

  if (!activeSiteId) {
    return (
      <>
        <Header title="Campaigns" leftElement={backButton} rightElement={<SiteSelector onSiteChange={setActiveSite} />} />
        <EmptyState icon={Megaphone} title="No Site Selected" />
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <Header title="Campaigns" leftElement={backButton} rightElement={<SiteSelector onSiteChange={setActiveSite} />} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
      >
        <PeriodSelector />

        {/* Campaign Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, ...continuousRadius(),
                  backgroundColor: isActive ? '#334155' : '#f1f5f9',
                }}
              >
                <tab.icon size={13} color={isActive ? '#fff' : '#64748b'} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: isActive ? '#fff' : '#64748b' }}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {isLoading ? (
          <LoadingState message="Loading..." />
        ) : data?.data && data.data.length > 0 ? (
          <View style={{ gap: 12 }}>
            <PieChartCard title={currentTab.label} data={data.data} icon={currentTab.icon} />
            <TopList title={currentTab.label} data={data.data} unit="visits" icon={currentTab.icon} />
          </View>
        ) : (
          <EmptyState icon={Megaphone} title="No Data" description={`No ${currentTab.label.toLowerCase()} data for this period`} />
        )}
      </ScrollView>
    </View>
  );
}
