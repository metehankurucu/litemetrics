import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FileText, Zap, UserCheck, ArrowLeft, Globe, Monitor, Smartphone, Tag, Code, MousePointer } from 'lucide-react-native';
import { Header } from 'src/components/common/Header';
import { formatDateTime, formatTime, countryToFlag } from 'src/lib/format';
import type { EventListItem } from '@litemetrics/core';

function TypeBadge({ type, source }: { type: string; source?: string }) {
  const config = {
    pageview: { label: 'Pageview', bg: '#eff6ff', color: '#3b82f6', Icon: FileText },
    event: { label: 'Event', bg: '#fef3c7', color: '#f59e0b', Icon: Zap },
    identify: { label: 'Identify', bg: '#ecfdf5', color: '#10b981', Icon: UserCheck },
  }[type] ?? { label: type, bg: '#f1f5f9', color: '#64748b', Icon: Zap };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: config.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
      }}>
        <config.Icon size={14} color={config.color} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: config.color }}>{config.label}</Text>
      </View>
      {source === 'auto' && (
        <View style={{ backgroundColor: '#f1f5f9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748b' }}>Auto</Text>
        </View>
      )}
    </View>
  );
}

function DetailRow({ label, value, selectable }: { label: string; value: string; selectable?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: '#f1f5f9' }}>
      <Text style={{ width: 110, fontSize: 13, color: '#94a3b8', fontWeight: '500' }}>{label}</Text>
      <Text selectable={selectable} style={{ flex: 1, fontSize: 14, color: '#0f172a' }}>{value}</Text>
    </View>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<any>; children: React.ReactNode }) {
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

function JsonBlock({ data }: { data: Record<string, unknown> }) {
  return (
    <ScrollView horizontal style={{
      backgroundColor: '#f8fafc', borderRadius: 10, ...continuousRadius(),
      padding: 12, marginTop: 4,
    }}>
      <Text selectable style={{ fontSize: 12, fontFamily: 'monospace', color: '#334155' }}>
        {JSON.stringify(data, null, 2)}
      </Text>
    </ScrollView>
  );
}

export default function EventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; event: string }>();

  const backButton = (
    <Pressable
      onPress={() => router.replace('/(tabs)/(events)/')}
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

  let event: EventListItem | null = null;
  try {
    event = params.event ? JSON.parse(params.event) : null;
  } catch { /* ignore */ }

  if (!event) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <Header title="Event Detail" leftElement={backButton} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 16, color: '#64748b' }}>Event not found</Text>
        </View>
      </View>
    );
  }

  const hasLocation = event.geo && (event.geo.country || event.geo.city);
  const hasDevice = event.device && (event.device.browser || event.device.os);
  const hasUtm = event.utm && Object.values(event.utm).some(Boolean);
  const hasProperties = event.properties && Object.keys(event.properties).length > 0;
  const hasTraits = event.traits && Object.keys(event.traits).length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <Header title="Event Detail" leftElement={backButton} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
      >
        {/* Event Header */}
        <View style={{
          backgroundColor: '#fff', borderRadius: 16, ...continuousRadius(),
          padding: 20, ...cardShadow(),
        }}>
          <TypeBadge type={event.type} source={event.eventSource} />
          <Text selectable style={{ fontSize: 18, fontWeight: '600', color: '#0f172a', marginTop: 12 }} numberOfLines={3}>
            {event.name || event.title || event.url || 'Unknown Event'}
          </Text>
          <Text style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
            {formatDateTime(event.timestamp)} · {formatTime(event.timestamp)}
          </Text>
        </View>

        {/* Core Fields */}
        <SectionCard title="Details" icon={Tag}>
          <DetailRow label="Type" value={event.type} />
          <DetailRow label="Visitor ID" value={event.visitorId} selectable />
          <DetailRow label="Session ID" value={event.sessionId} selectable />
          {event.eventSource && <DetailRow label="Source" value={event.eventSource} />}
          {event.eventSubtype && <DetailRow label="Subtype" value={event.eventSubtype} />}
          {event.userId && <DetailRow label="User ID" value={event.userId} selectable />}
        </SectionCard>

        {/* Page/Event Details */}
        {(event.url || event.referrer || event.title || event.pagePath || event.name) && (
          <SectionCard title="Page / Event" icon={FileText}>
            {event.url && <DetailRow label="URL" value={event.url} selectable />}
            {event.referrer && <DetailRow label="Referrer" value={event.referrer} selectable />}
            {event.title && <DetailRow label="Page Title" value={event.title} />}
            {event.name && <DetailRow label="Event Name" value={event.name} />}
            {event.pagePath && <DetailRow label="Page Path" value={event.pagePath} />}
            {event.targetUrlPath && <DetailRow label="Target URL" value={event.targetUrlPath} selectable />}
            {event.elementSelector && <DetailRow label="Element" value={event.elementSelector} />}
            {event.elementText && <DetailRow label="Element Text" value={event.elementText} />}
            {event.scrollDepthPct !== undefined && <DetailRow label="Scroll Depth" value={`${event.scrollDepthPct}%`} />}
          </SectionCard>
        )}

        {/* Location & Device */}
        {(hasLocation || hasDevice) && (
          <SectionCard title="Location & Device" icon={Monitor}>
            {event.geo?.country && (
              <DetailRow
                label="Location"
                value={`${countryToFlag(event.geo.country)} ${[event.geo.city, event.geo.region, event.geo.country].filter(Boolean).join(', ')}`}
              />
            )}
            {event.device?.browser && <DetailRow label="Browser" value={event.device.browser} />}
            {event.device?.os && (
              <DetailRow
                label="OS"
                value={[event.device.os, event.device.osVersion].filter(Boolean).join(' ')}
              />
            )}
            {event.device?.type && <DetailRow label="Device Type" value={event.device.type} />}
            {event.device?.deviceModel && <DetailRow label="Device Model" value={event.device.deviceModel} />}
            {event.device?.deviceBrand && <DetailRow label="Device Brand" value={event.device.deviceBrand} />}
            {event.device?.appVersion && <DetailRow label="App Version" value={event.device.appVersion} />}
            {event.language && <DetailRow label="Language" value={event.language} />}
          </SectionCard>
        )}

        {/* Attribution */}
        {hasUtm && (
          <SectionCard title="Attribution" icon={Globe}>
            {event.utm?.source && <DetailRow label="UTM Source" value={event.utm.source} />}
            {event.utm?.medium && <DetailRow label="UTM Medium" value={event.utm.medium} />}
            {event.utm?.campaign && <DetailRow label="UTM Campaign" value={event.utm.campaign} />}
            {event.utm?.term && <DetailRow label="UTM Term" value={event.utm.term} />}
            {event.utm?.content && <DetailRow label="UTM Content" value={event.utm.content} />}
          </SectionCard>
        )}

        {/* Custom Data */}
        {(hasProperties || hasTraits) && (
          <SectionCard title="Custom Data" icon={Code}>
            {hasProperties && (
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#94a3b8', marginBottom: 4 }}>Properties</Text>
                <JsonBlock data={event.properties!} />
              </View>
            )}
            {hasTraits && (
              <View style={{ marginTop: hasProperties ? 12 : 0 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#94a3b8', marginBottom: 4 }}>Traits</Text>
                <JsonBlock data={event.traits!} />
              </View>
            )}
          </SectionCard>
        )}

        {/* Navigate to User */}
        <Pressable
          onPress={() => router.push({ pathname: '/(tabs)/(users)/[id]', params: { id: event.visitorId } })}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#fff', borderRadius: 12, ...continuousRadius(),
            paddingVertical: 14, gap: 8, ...cardShadow(),
          }}
        >
          <UserCheck size={18} color="#0ea5e9" />
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#0ea5e9' }}>View User Profile</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
