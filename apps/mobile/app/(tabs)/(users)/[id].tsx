import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import React, { useState } from 'react';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Clock, MapPin, Monitor, FileText, Zap, UserX, Activity, UserCheck, Link2, Globe, Smartphone, Hash, ChartBar, Eye, Layers } from 'lucide-react-native';
import { useUserDetail, useUserEvents } from 'src/api/hooks/useUsers';
import { Header } from 'src/components/common/Header';
import { LoadingState } from 'src/components/common/LoadingState';
import { EmptyState } from 'src/components/common/EmptyState';
import { Pagination } from 'src/components/common/Pagination';
import { formatRelativeTime, formatDateTime, formatNumber, countryToFlag } from 'src/lib/format';
import type { EventListItem } from '@litemetrics/core';
import type { LucideIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1'];
  return colors[Math.abs(hash) % colors.length];
}

function InfoCard({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: string | number; color: string }) {
  return (
    <View style={{
      backgroundColor: '#fff', borderRadius: 14, ...continuousRadius(),
      padding: 14, minWidth: 130, ...cardShadow(),
    }}>
      <Icon size={18} color={color} />
      <Text style={{ fontSize: 20, fontWeight: '700', color: '#0f172a', marginTop: 8, fontVariant: ['tabular-nums'] }}>
        {typeof value === 'number' ? formatNumber(value) : value}
      </Text>
      <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <View style={{
      backgroundColor: '#fff', borderRadius: 14, ...continuousRadius(),
      padding: 16, ...cardShadow(),
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Icon size={16} color="#64748b" />
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: '#f1f5f9' }}>
      <Text style={{ width: 110, fontSize: 13, color: '#94a3b8', fontWeight: '500' }}>{label}</Text>
      <Text selectable style={{ flex: 1, fontSize: 14, color: '#0f172a', fontFamily: mono ? 'monospace' : undefined }}>{value}</Text>
    </View>
  );
}

const EVENT_COLORS = {
  pageview: { dot: '#3b82f6', bg: '#eff6ff' },
  event: { dot: '#8b5cf6', bg: '#f5f3ff' },
  identify: { dot: '#10b981', bg: '#ecfdf5' },
};

export default function UserDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: user, isLoading } = useUserDetail(id ?? '');
  const [eventsPage, setEventsPage] = useState(0);
  const { data: eventsResult } = useUserEvents(id ?? '', eventsPage, 30);

  const backButton = (
    <Pressable
      onPress={() => router.replace('/(tabs)/(users)/')}
      hitSlop={8}
      style={{
        width: 34, height: 34, borderRadius: 10,
        ...continuousRadius(),
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#e2e8f0',
      }}
    >
      <ArrowLeft size={18} color="#334155" />
    </Pressable>
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <Header title="User Detail" leftElement={backButton} />
        <LoadingState message="Loading user..." />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <Header title="User Detail" leftElement={backButton} />
        <EmptyState icon={UserX} title="User Not Found" />
      </View>
    );
  }

  const displayName = user.userId || user.visitorId || 'Anonymous';
  const initials = displayName.slice(0, 2).toUpperCase();
  const avatarColor = hashColor(displayName);
  const eventsList: EventListItem[] = Array.isArray(eventsResult?.events) ? eventsResult.events : [];
  const totalEvents = eventsResult?.total ?? 0;
  const totalPages = Math.ceil(totalEvents / 30);
  const hasLinkedDevices = (user.visitorIds?.length ?? 0) > 1;

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <Header title="User Detail" leftElement={backButton} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ margin: 16, gap: 12, paddingBottom: 32 }}
      >
        {/* User Header */}
        <View style={{
          backgroundColor: '#fff', borderRadius: 16, ...continuousRadius(),
          padding: 20, alignItems: 'center', ...cardShadow(),
        }}>
          <View style={{
            width: 64, height: 64, borderRadius: 32,
            backgroundColor: avatarColor + '20',
            justifyContent: 'center', alignItems: 'center', marginBottom: 12,
          }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: avatarColor }}>{initials}</Text>
          </View>
          <Text selectable style={{ fontSize: 18, fontWeight: '600', color: '#0f172a' }}>
            {user.userId || 'Anonymous User'}
          </Text>
          <Text selectable style={{ fontSize: 13, color: '#94a3b8', fontFamily: 'monospace', marginTop: 4 }}>
            {user.visitorId}
          </Text>
        </View>

        {/* Info Cards Row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          <InfoCard icon={ChartBar} label="Total Events" value={user.totalEvents ?? 0} color="#8b5cf6" />
          <InfoCard icon={Eye} label="Pageviews" value={user.totalPageviews ?? 0} color="#3b82f6" />
          <InfoCard icon={Layers} label="Sessions" value={user.totalSessions ?? 0} color="#10b981" />
          <InfoCard icon={Clock} label="First Seen" value={user.firstSeen ? formatRelativeTime(user.firstSeen) : '—'} color="#f59e0b" />
        </ScrollView>

        {/* Profile Card */}
        <SectionCard title="Profile" icon={UserCheck}>
          {user.userId && <DetailRow label="User ID" value={user.userId} mono />}
          <DetailRow label="Visitor ID" value={user.visitorId} mono />
          {hasLinkedDevices && (
            <View style={{ paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: '#f1f5f9' }}>
              <Text style={{ fontSize: 13, color: '#94a3b8', fontWeight: '500', marginBottom: 6 }}>
                Linked Devices ({user.visitorIds!.length})
              </Text>
              {user.visitorIds!.map(vid => (
                <Text key={vid} selectable style={{
                  fontSize: 12, fontFamily: 'monospace', color: '#334155',
                  paddingVertical: 2,
                }}>
                  {vid}
                </Text>
              ))}
            </View>
          )}
          <DetailRow label="First Seen" value={user.firstSeen ? formatDateTime(user.firstSeen) : '—'} />
          <DetailRow label="Last Seen" value={user.lastSeen ? formatDateTime(user.lastSeen) : '—'} />
          {user.lastUrl && <DetailRow label="Last Page" value={user.lastUrl} />}
          {user.referrer && <DetailRow label="Referrer" value={user.referrer} />}
        </SectionCard>

        {/* Environment Card */}
        <SectionCard title="Environment" icon={Monitor}>
          {user.device && (
            <>
              <DetailRow
                label="Device"
                value={[user.device.browser, user.device.os, user.device.type].filter(Boolean).join(' · ')}
              />
              {user.device.osVersion && <DetailRow label="OS Version" value={user.device.osVersion} />}
              {user.device.deviceModel && <DetailRow label="Device Model" value={user.device.deviceModel} />}
              {user.device.deviceBrand && <DetailRow label="Device Brand" value={user.device.deviceBrand} />}
              {user.device.appVersion && <DetailRow label="App Version" value={user.device.appVersion} />}
            </>
          )}
          {user.geo && (user.geo.country || user.geo.city) && (
            <DetailRow
              label="Location"
              value={`${user.geo.country ? countryToFlag(user.geo.country) + ' ' : ''}${[user.geo.city, user.geo.region, user.geo.country].filter(Boolean).join(', ')}`}
            />
          )}
          {user.language && <DetailRow label="Language" value={user.language} />}
          {user.timezone && <DetailRow label="Timezone" value={user.timezone} />}
          {user.screen && <DetailRow label="Screen" value={`${user.screen.width} × ${user.screen.height}`} />}
        </SectionCard>

        {/* Attribution & Traits */}
        <SectionCard title="Attribution & Traits" icon={Globe}>
          {user.utm && Object.values(user.utm).some(Boolean) ? (
            <>
              {user.utm.source && <DetailRow label="UTM Source" value={user.utm.source} />}
              {user.utm.medium && <DetailRow label="UTM Medium" value={user.utm.medium} />}
              {user.utm.campaign && <DetailRow label="UTM Campaign" value={user.utm.campaign} />}
              {user.utm.term && <DetailRow label="UTM Term" value={user.utm.term} />}
              {user.utm.content && <DetailRow label="UTM Content" value={user.utm.content} />}
            </>
          ) : (
            <Text style={{ fontSize: 13, color: '#94a3b8' }}>No UTM data</Text>
          )}

          {user.traits && Object.keys(user.traits).length > 0 ? (
            <View style={{ marginTop: 12, borderTopWidth: 0.5, borderTopColor: '#f1f5f9', paddingTop: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#94a3b8', marginBottom: 8 }}>Custom Traits</Text>
              {Object.entries(user.traits).map(([key, value]) => (
                <DetailRow key={key} label={key} value={String(value)} />
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: 13, color: '#94a3b8', marginTop: 8 }}>No custom traits</Text>
          )}
        </SectionCard>

        {/* Event Timeline */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Activity size={14} color="#64748b" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Event Timeline ({totalEvents})
            </Text>
          </View>

          {eventsList.length > 0 ? (
            <View style={{ gap: 0 }}>
              {eventsList.map((event: EventListItem, idx: number) => {
                const colors = EVENT_COLORS[event.type as keyof typeof EVENT_COLORS] ?? EVENT_COLORS.event;
                const isLast = idx === eventsList.length - 1;
                const EventIcon = event.type === 'pageview' ? FileText : event.type === 'identify' ? UserCheck : Zap;

                return (
                  <Pressable
                    key={event.id ?? `event-${idx}`}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push({
                        pathname: '/(tabs)/(events)/[id]',
                        params: { id: event.id, event: JSON.stringify(event) },
                      });
                    }}
                    style={{ flexDirection: 'row', gap: 12 }}
                  >
                    {/* Timeline dot + line */}
                    <View style={{ alignItems: 'center', width: 24 }}>
                      <View style={{
                        width: 12, height: 12, borderRadius: 6,
                        backgroundColor: colors.dot, marginTop: 4,
                      }} />
                      {!isLast && (
                        <View style={{ width: 2, flex: 1, backgroundColor: '#e2e8f0' }} />
                      )}
                    </View>

                    {/* Event content */}
                    <View style={{
                      flex: 1, backgroundColor: '#fff', borderRadius: 12, ...continuousRadius(),
                      padding: 12, marginBottom: 8, ...cardShadow(),
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <EventIcon size={14} color={colors.dot} />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.dot, textTransform: 'uppercase' }}>
                          {event.type}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: '#0f172a', marginTop: 4 }} numberOfLines={2}>
                        {event.type === 'pageview'
                          ? (event.title || event.url || 'Pageview')
                          : event.type === 'identify'
                            ? (event.userId || 'Identify')
                            : (event.name || 'Event')}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                        {event.timestamp ? formatRelativeTime(event.timestamp) : ''}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}

              <Pagination
                page={eventsPage}
                totalPages={totalPages}
                onPrevious={() => setEventsPage(p => Math.max(0, p - 1))}
                onNext={() => setEventsPage(p => Math.min(totalPages - 1, p + 1))}
              />
            </View>
          ) : (
            <EmptyState icon={Activity} title="No Events" description="No events recorded for this user" />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
