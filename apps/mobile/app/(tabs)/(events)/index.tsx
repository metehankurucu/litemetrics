import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { FileText, Zap, Inbox, ChevronRight, UserCheck, Target, Share2 } from 'lucide-react-native';
import { useAuthStore } from 'src/stores/auth-store';
import { useEvents } from 'src/api/hooks/useEvents';
import { useSite } from 'src/api/hooks/useSites';
import { Header } from 'src/components/common/Header';
import { LoadingState } from 'src/components/common/LoadingState';
import { EmptyState } from 'src/components/common/EmptyState';
import { Pagination } from 'src/components/common/Pagination';
import { formatRelativeTime } from 'src/lib/format';
import { exportCSV } from 'src/lib/export';
import type { EventListItem, EventType } from '@litemetrics/core';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';

type EventFilter = 'all' | 'pageview' | 'event' | 'conversion' | 'identify';
type SourceFilter = '' | 'auto' | 'manual';

const TYPE_FILTERS: { label: string; value: EventFilter; Icon: React.ComponentType<any> }[] = [
  { label: 'All', value: 'all', Icon: Inbox },
  { label: 'Pageview', value: 'pageview', Icon: FileText },
  { label: 'Event', value: 'event', Icon: Zap },
  { label: 'Conversion', value: 'conversion', Icon: Target },
  { label: 'Identify', value: 'identify', Icon: UserCheck },
];

const SOURCE_FILTERS: { label: string; value: SourceFilter }[] = [
  { label: 'All', value: '' },
  { label: 'Auto', value: 'auto' },
  { label: 'Manual', value: 'manual' },
];

const PERIOD_OPTIONS = ['1h', '24h', '7d', '30d', '90d'] as const;

const LIMIT = 30;

export default function EventsScreen() {
  const router = useRouter();
  const { activeSiteId } = useAuthStore();
  const { data: site } = useSite(activeSiteId);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<EventFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('');
  const [eventPeriod, setEventPeriod] = useState<string>('24h');
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Build query options
  const queryOptions = useMemo(() => {
    const opts: any = { period: eventPeriod, limit: LIMIT, offset: page * LIMIT };
    if (typeFilter === 'conversion' && site?.conversionEvents?.length) {
      opts.type = 'event';
      opts.eventNames = site.conversionEvents;
    } else if (typeFilter !== 'all' && typeFilter !== 'conversion') {
      opts.type = typeFilter as EventType;
    }
    if (sourceFilter) opts.eventSource = sourceFilter;
    if (search.trim()) opts.eventName = search.trim();
    return opts;
  }, [typeFilter, sourceFilter, eventPeriod, page, search, site?.conversionEvents]);

  const { data: result, isLoading, refetch: refetchEvents } = useEvents(queryOptions);
  const events = result?.events ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  const resetPage = useCallback(() => setPage(0), []);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchEvents();
    } finally {
      setRefreshing(false);
    }
  }, [refetchEvents]);

  const handleExport = () => {
    if (!events.length) return;
    const data = events.map((e: EventListItem) => ({
      type: e.type, name: e.name || '', url: e.url || '', timestamp: e.timestamp,
      country: e.geo?.country || '', browser: e.device?.browser || '', os: e.device?.os || '',
    }));
    exportCSV(data, `events_${eventPeriod}`);
  };

  if (!activeSiteId) {
    return (
      <>
        <Header title="Events" />
        <EmptyState icon={Inbox} title="No Site Selected" />
      </>
    );
  }

  if (isLoading && page === 0) {
    return (
      <>
        <Header title="Events" />
        <LoadingState message="Loading events..." />
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <Header
        title="Events"
        rightElement={
          <Pressable onPress={handleExport} hitSlop={8}>
            <Share2 size={20} color="#64748b" />
          </Pressable>
        }
        searchBar={{ placeholder: 'Search events...', value: search, onChangeText: (v: string) => { setSearch(v); resetPage(); } }}
      />
      <FlatList
        data={events}
        keyExtractor={(item: EventListItem, i: number) => `${item.id ?? item.timestamp}-${i}`}
        contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 32 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListHeaderComponent={
          <View style={{
            backgroundColor: '#fff', borderRadius: 14, ...continuousRadius(),
            padding: 12, gap: 10, marginBottom: 8,
            ...cardShadow(),
          }}>
            {/* Period */}
            <View style={{
              flexDirection: 'row', backgroundColor: '#f1f5f9',
              borderRadius: 10, ...continuousRadius(), padding: 3,
            }}>
              {PERIOD_OPTIONS.map(p => {
                const isActive = eventPeriod === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => { setEventPeriod(p); resetPage(); }}
                    style={{
                      flex: 1, paddingVertical: 7, borderRadius: 8, ...continuousRadius(),
                      alignItems: 'center',
                      ...(isActive ? { backgroundColor: '#fff', ...cardShadow() } : {}),
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: isActive ? '#0f172a' : '#64748b' }}>
                      {p.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Type */}
            <View style={{
              flexDirection: 'row', backgroundColor: '#f1f5f9',
              borderRadius: 10, ...continuousRadius(), padding: 3,
            }}>
              {TYPE_FILTERS.map(f => {
                const isActive = typeFilter === f.value;
                return (
                  <Pressable
                    key={f.value}
                    onPress={() => { setTypeFilter(f.value); resetPage(); }}
                    style={{
                      flex: 1, paddingVertical: 7, borderRadius: 8, ...continuousRadius(),
                      alignItems: 'center',
                      ...(isActive ? { backgroundColor: '#fff', ...cardShadow() } : {}),
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: isActive ? '#0f172a' : '#64748b' }}>
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Source */}
            <View style={{
              flexDirection: 'row', backgroundColor: '#f1f5f9',
              borderRadius: 10, ...continuousRadius(), padding: 3,
            }}>
              {SOURCE_FILTERS.map(f => {
                const isActive = sourceFilter === f.value;
                return (
                  <Pressable
                    key={f.value}
                    onPress={() => { setSourceFilter(f.value); resetPage(); }}
                    style={{
                      flex: 1, paddingVertical: 7, borderRadius: 8, ...continuousRadius(),
                      alignItems: 'center',
                      ...(isActive ? { backgroundColor: '#fff', ...cardShadow() } : {}),
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: isActive ? '#0f172a' : '#64748b' }}>
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Event count */}
            <Text style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
              {total} event{total !== 1 ? 's' : ''}
            </Text>
          </View>
        }
        renderItem={({ item }: { item: EventListItem }) => {
          const isPageview = item.type === 'pageview';
          const isIdentify = item.type === 'identify';
          const EventIcon = isIdentify ? UserCheck : isPageview ? FileText : Zap;
          const iconBg = isIdentify ? '#ecfdf5' : isPageview ? '#eff6ff' : '#fef3c7';
          const iconColor = isIdentify ? '#10b981' : isPageview ? '#3b82f6' : '#f59e0b';
          return (
            <Pressable
              onPress={() => router.push({
                pathname: '/(tabs)/(events)/[id]',
                params: { id: item.id, event: JSON.stringify(item) },
              })}
              style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: '#fff', borderRadius: 12, ...continuousRadius(),
                padding: 14, gap: 12, ...cardShadow(),
              }}
            >
              <View style={{
                width: 36, height: 36, borderRadius: 10, ...continuousRadius(),
                backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center',
              }}>
                <EventIcon size={18} color={iconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '500', color: '#0f172a' }} numberOfLines={1}>
                  {item.name || item.title || item.url || (isIdentify ? item.userId : 'Unknown')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  {item.eventSource === 'auto' && (
                    <View style={{ backgroundColor: '#f1f5f9', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 10, fontWeight: '500', color: '#94a3b8' }}>Auto</Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 12, color: '#94a3b8' }}>
                    {item.geo?.country ? `${item.geo.country} · ` : ''}{formatRelativeTime(item.timestamp)}
                  </Text>
                </View>
              </View>
              <ChevronRight size={16} color="#cbd5e1" />
            </Pressable>
          );
        }}
        ListFooterComponent={
          totalPages > 1 ? (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPrevious={() => setPage(p => Math.max(0, p - 1))}
              onNext={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            />
          ) : null
        }
        ListEmptyComponent={
          <EmptyState icon={Inbox} title="No Events" description="No events match your filters" />
        }
      />
    </View>
  );
}
