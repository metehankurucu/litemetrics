import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ArrowLeft, RefreshCcw } from 'lucide-react-native';
import { useAuthStore } from 'src/stores/auth-store';
import { useRetention } from 'src/api/hooks/useRetention';
import { Header } from 'src/components/common/Header';
import { SiteSelector } from 'src/components/common/SiteSelector';
import { LoadingState } from 'src/components/common/LoadingState';
import { EmptyState } from 'src/components/common/EmptyState';
import { formatNumber } from 'src/lib/format';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';

const WEEK_OPTIONS = [4, 6, 8, 10, 12] as const;

function getHeatmapColor(pct: number): string {
  if (pct >= 80) return '#312e81';
  if (pct >= 60) return '#3730a3';
  if (pct >= 40) return '#4338ca';
  if (pct >= 30) return '#4f46e5';
  if (pct >= 20) return '#6366f1';
  if (pct >= 10) return '#818cf8';
  if (pct >= 5) return '#a5b4fc';
  if (pct > 0) return '#c7d2fe';
  return '#f1f5f9';
}

function getTextColor(pct: number): string {
  return pct >= 30 ? '#fff' : '#334155';
}

export default function RetentionScreen() {
  const { activeSiteId, setActiveSite } = useAuthStore();
  const router = useRouter();
  const [weeks, setWeeks] = useState<number>(8);
  const { data, isLoading } = useRetention('90d', weeks);
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

  const cohorts = data?.cohorts ?? [];

  if (!activeSiteId) {
    return (
      <>
        <Header title="Retention" leftElement={backButton} rightElement={<SiteSelector onSiteChange={setActiveSite} />} />
        <EmptyState icon={RefreshCcw} title="No Site Selected" />
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <Header title="Retention" leftElement={backButton} rightElement={<SiteSelector onSiteChange={setActiveSite} />} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
      >
        {/* Week selector */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '500' }}>Weeks:</Text>
          {WEEK_OPTIONS.map(w => (
            <Pressable
              key={w}
              onPress={() => setWeeks(w)}
              style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, ...continuousRadius(),
                backgroundColor: weeks === w ? '#0ea5e9' : '#f1f5f9',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: weeks === w ? '#fff' : '#64748b' }}>
                {w}
              </Text>
            </Pressable>
          ))}
        </View>

        {isLoading ? (
          <LoadingState message="Loading retention data..." />
        ) : cohorts.length > 0 ? (
          <View style={{
            backgroundColor: '#fff', borderRadius: 14, ...continuousRadius(),
            padding: 12, ...cardShadow(),
          }}>
            {/* Scrollable table */}
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                {/* Header row */}
                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 8, marginBottom: 4 }}>
                  <View style={{ width: 90 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748b' }}>Cohort</Text>
                  </View>
                  <View style={{ width: 60 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748b' }}>Users</Text>
                  </View>
                  {Array.from({ length: weeks + 1 }).map((_, i) => (
                    <View key={i} style={{ width: 50, alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: '#64748b' }}>Wk {i}</Text>
                    </View>
                  ))}
                </View>

                {/* Data rows */}
                {cohorts.map((cohort, idx) => (
                  <View key={cohort.week ?? idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3 }}>
                    <View style={{ width: 90 }}>
                      <Text style={{ fontSize: 11, color: '#334155' }}>
                        {cohort.week ? new Date(cohort.week).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : `W${idx}`}
                      </Text>
                    </View>
                    <View style={{ width: 60 }}>
                      <Text style={{ fontSize: 11, color: '#334155', fontVariant: ['tabular-nums'] }}>
                        {formatNumber(cohort.size)}
                      </Text>
                    </View>
                    {cohort.retention.map((pct, wIdx) => (
                      <View key={wIdx} style={{
                        width: 50, height: 28, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: getHeatmapColor(pct), borderRadius: 4, marginHorizontal: 1,
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: getTextColor(pct), fontVariant: ['tabular-nums'] }}>
                          {pct.toFixed(0)}%
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>

            {/* Legend */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
              <Text style={{ fontSize: 10, color: '#94a3b8', marginRight: 4 }}>Low</Text>
              {['#f1f5f9', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81'].map(c => (
                <View key={c} style={{ width: 16, height: 10, backgroundColor: c, borderRadius: 2 }} />
              ))}
              <Text style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>High</Text>
            </View>
          </View>
        ) : (
          <EmptyState icon={RefreshCcw} title="Not Enough Data" description="Not enough data for retention analysis" />
        )}
      </ScrollView>
    </View>
  );
}
