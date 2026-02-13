import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Activity, ArrowLeft, FileText, Zap, UserCheck, Globe } from 'lucide-react-native';
import { useAuthStore } from 'src/stores/auth-store';
import { useLiveVisitors } from 'src/api/hooks/useAnalytics';
import { useEvents } from 'src/api/hooks/useEvents';
import { Header } from 'src/components/common/Header';
import { SiteSelector } from 'src/components/common/SiteSelector';
import { EmptyState } from 'src/components/common/EmptyState';
import { formatTime, countryToFlag } from 'src/lib/format';
import type { EventListItem } from '@litemetrics/core';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';

export default function RealtimeScreen() {
  const { activeSiteId, setActiveSite } = useAuthStore();
  const router = useRouter();
  const { data: liveCount, refetch } = useLiveVisitors();
  const { data: eventsResult } = useEvents({ period: '1h' as any, limit: 30 });
  const [refreshing, setRefreshing] = useState(false);

  const events = eventsResult?.events ?? [];
  const backToAnalytics = () => router.push('/(tabs)/(analytics)/');
  const backButton = (
    <Pressable
      onPress={backToAnalytics}
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

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (!activeSiteId) {
    return (
      <>
        <Header title="Realtime" leftElement={backButton} rightElement={<SiteSelector onSiteChange={setActiveSite} />} />
        <EmptyState icon={Activity} title="No Site Selected" />
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <Header title="Realtime" leftElement={backButton} rightElement={<SiteSelector onSiteChange={setActiveSite} />} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Live Count Hero */}
        <View style={{
          backgroundColor: '#fff', borderRadius: 20, ...continuousRadius(),
          padding: 32, alignItems: 'center', ...cardShadow(),
        }}>
          <View style={{
            width: 16, height: 16, borderRadius: 8, backgroundColor: '#22c55e',
            marginBottom: 16,
          }} />
          <Text style={{
            fontSize: 56, fontWeight: '800', color: '#0f172a',
            fontVariant: ['tabular-nums'], lineHeight: 60,
          }}>
            {liveCount ?? 0}
          </Text>
          <Text style={{ fontSize: 15, color: '#64748b', marginTop: 8 }}>
            active visitor{(liveCount ?? 0) !== 1 ? 's' : ''} in the last hour
          </Text>
        </View>

        {/* Recent Events */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Activity size={14} color="#64748b" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Recent Events ({events.length})
            </Text>
          </View>

          {events.length > 0 ? (
            <View style={{ gap: 6 }}>
              {events.map((event: EventListItem, idx: number) => {
                const isPageview = event.type === 'pageview';
                const isIdentify = event.type === 'identify';
                const EventIcon = isIdentify ? UserCheck : isPageview ? FileText : Zap;
                const badgeColor = isIdentify ? '#10b981' : isPageview ? '#3b82f6' : '#f59e0b';
                const badgeLabel = isIdentify ? 'ID' : isPageview ? 'PV' : 'EV';

                return (
                  <View key={event.id ?? `rt-${idx}`} style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: '#fff', borderRadius: 12, ...continuousRadius(),
                    padding: 12, gap: 10, ...cardShadow(),
                  }}>
                    <View style={{
                      backgroundColor: badgeColor + '18', borderRadius: 6,
                      paddingHorizontal: 8, paddingVertical: 4,
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: badgeColor }}>{badgeLabel}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: '#0f172a' }} numberOfLines={1}>
                        {event.name || event.title || event.url || (isIdentify ? event.userId : 'Unknown')}
                      </Text>
                    </View>
                    {event.geo?.country && (
                      <Text style={{ fontSize: 13 }}>{countryToFlag(event.geo.country)}</Text>
                    )}
                    <Text style={{ fontSize: 12, color: '#94a3b8', fontVariant: ['tabular-nums'] }}>
                      {formatTime(event.timestamp)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <EmptyState icon={Activity} title="No Recent Events" description="Events will appear here in real-time" />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
