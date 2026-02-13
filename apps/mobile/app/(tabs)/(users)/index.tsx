import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { User, Users, ChevronRight, Share2 } from 'lucide-react-native';
import { useAuthStore } from 'src/stores/auth-store';
import { useUsers } from 'src/api/hooks/useUsers';
import { Header } from 'src/components/common/Header';
import { LoadingState } from 'src/components/common/LoadingState';
import { EmptyState } from 'src/components/common/EmptyState';
import { formatRelativeTime } from 'src/lib/format';
import { exportCSV } from 'src/lib/export';
import type { UserDetail } from '@litemetrics/core';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';

export default function UsersScreen() {
  const router = useRouter();
  const { activeSiteId } = useAuthStore();
  const { data: result, isLoading, refetch } = useUsers();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    const users = result?.users;
    if (!Array.isArray(users)) return [];
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter((u: UserDetail) =>
      (u.userId?.toLowerCase().includes(q)) ||
      (u.visitorId?.toLowerCase().includes(q)) ||
      (u.geo?.country?.toLowerCase().includes(q))
    );
  }, [result, search]);

  const handleExport = () => {
    if (!filtered.length) return;
    const data = filtered.map((u: UserDetail) => ({
      userId: u.userId || '', visitorId: u.visitorId || '',
      country: u.geo?.country || '', browser: u.device?.browser || '',
      totalEvents: u.totalEvents ?? 0, lastSeen: u.lastSeen || '',
    }));
    exportCSV(data, 'users');
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  if (!activeSiteId) {
    return (
      <>
        <Header title="Users" />
        <EmptyState icon={Users} title="No Site Selected" />
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <Header title="Users" />
        <LoadingState message="Loading users..." />
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <Header
        title="Users"
        rightElement={
          <Pressable onPress={handleExport} hitSlop={8}>
            <Share2 size={20} color="#64748b" />
          </Pressable>
        }
        searchBar={{ placeholder: 'Search users...', value: search, onChangeText: setSearch }}
      />
      <FlatList
        data={filtered}
        keyExtractor={(item: UserDetail, i: number) => item.visitorId || `user-${i}`}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        renderItem={({ item }: { item: UserDetail }) => (
          <Pressable
            onPress={() => router.push(`/(tabs)/(users)/${item.visitorId || item.userId || 'unknown'}`)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#fff',
              borderRadius: 14,
              ...continuousRadius(),
              padding: 14,
              gap: 12,
              ...cardShadow(),
            }}
          >
            <View style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: '#eff6ff',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <User size={20} color="#3b82f6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '500', color: '#0f172a' }} numberOfLines={1}>
                {item.userId || item.visitorId?.slice(0, 12) || 'Anonymous'}
              </Text>
              <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                {[item.geo?.country, item.device?.browser].filter(Boolean).join(' · ') || 'Unknown'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#0f172a', fontVariant: ['tabular-nums'] }}>
                {item.totalEvents ?? 0}
              </Text>
              <Text style={{ fontSize: 11, color: '#94a3b8' }}>
                {item.lastSeen ? formatRelativeTime(item.lastSeen) : ''}
              </Text>
            </View>
            <ChevronRight size={16} color="#cbd5e1" />
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState icon={Users} title="No Users" description="No users found" />
        }
      />
    </View>
  );
}
