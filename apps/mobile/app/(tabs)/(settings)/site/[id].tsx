import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import React, { useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Globe, Smartphone, Copy, Eye, EyeOff, RefreshCw, Trash2, Plus, X, Shield, Target, BookOpen } from 'lucide-react-native';
import { useSite, useUpdateSite, useDeleteSite, useRegenerateSecret } from 'src/api/hooks/useSites';
import { useAuthStore } from 'src/stores/auth-store';
import { Header } from 'src/components/common/Header';
import { LoadingState } from 'src/components/common/LoadingState';
import { formatDateTime } from 'src/lib/format';

type Platform = 'html' | 'react' | 'react-native' | 'nextjs' | 'node';

const PLATFORMS: { key: Platform; label: string }[] = [
  { key: 'html', label: 'HTML' },
  { key: 'react', label: 'React' },
  { key: 'react-native', label: 'React Native' },
  { key: 'nextjs', label: 'Next.js' },
  { key: 'node', label: 'Node.js' },
];

function getSetupSnippet(platform: Platform, siteId: string, secretKey: string, serverUrl: string): string {
  switch (platform) {
    case 'html':
      return `<!-- Add before </head> or </body> -->\n<script src="${serverUrl}/litemetrics.js"></script>\n<script>\n  Litemetrics.createTracker({\n    siteId: '${siteId}',\n    endpoint: '${serverUrl}/api/collect',\n  });\n</script>`;
    case 'react':
      return `// 1. Install: bun add @litemetrics/react\n\nimport { LitemetricsProvider } from '@litemetrics/react';\n\nfunction App() {\n  return (\n    <LitemetricsProvider\n      siteId="${siteId}"\n      endpoint="${serverUrl}/api/collect"\n    >\n      <YourApp />\n    </LitemetricsProvider>\n  );\n}`;
    case 'react-native':
      return `// 1. Install: bun add @litemetrics/react-native\n\nimport { LitemetricsProvider } from '@litemetrics/react-native';\n\nfunction App() {\n  return (\n    <LitemetricsProvider\n      siteId="${siteId}"\n      endpoint="${serverUrl}/api/collect"\n    >\n      <YourApp />\n    </LitemetricsProvider>\n  );\n}`;
    case 'nextjs':
      return `// 1. Install: bun add @litemetrics/react\n\n// app/providers.tsx\n'use client';\nimport { LitemetricsProvider } from '@litemetrics/react';\n\nexport function Providers({ children }) {\n  return (\n    <LitemetricsProvider\n      siteId="${siteId}"\n      endpoint="${serverUrl}/api/collect"\n    >\n      {children}\n    </LitemetricsProvider>\n  );\n}`;
    case 'node':
      return `// Install: bun add @litemetrics/client\n\nimport { createClient } from '@litemetrics/client';\n\nconst client = createClient({\n  baseUrl: '${serverUrl}',\n  siteId: '${siteId}',\n  secretKey: '${secretKey}',\n});\n\nconst pageviews = await client.getStats('pageviews', { period: '7d' });`;
  }
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

function InfoRow({ label, value, mono, copyable }: { label: string; value: string; mono?: boolean; copyable?: boolean }) {
  const handleCopy = async () => {
    await Clipboard.setStringAsync(value);
    Alert.alert('Copied', `${label} copied to clipboard`);
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: '#f1f5f9' }}>
      <Text style={{ width: 100, fontSize: 13, color: '#94a3b8', fontWeight: '500' }}>{label}</Text>
      <Text selectable style={{ flex: 1, fontSize: 14, color: '#0f172a', fontFamily: mono ? 'monospace' : undefined }}>{value}</Text>
      {copyable && (
        <Pressable onPress={handleCopy} hitSlop={10} style={{ padding: 4 }}>
          <Copy size={16} color="#94a3b8" />
        </Pressable>
      )}
    </View>
  );
}

function TagList({
  items, onAdd, onRemove, placeholder,
}: { items: string[]; onAdd: (v: string) => void; onRemove: (v: string) => void; placeholder: string }) {
  const [input, setInput] = useState('');
  const handleAdd = () => {
    const val = input.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (val && !items.includes(val)) {
      onAdd(val);
      setInput('');
    }
  };
  return (
    <View>
      {items.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {items.map(item => (
            <View key={item} style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
            }}>
              <Text style={{ fontSize: 13, color: '#334155' }}>{item}</Text>
              <Pressable onPress={() => onRemove(item)} hitSlop={8}>
                <X size={14} color="#94a3b8" />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          style={{
            flex: 1, backgroundColor: '#f8fafc', borderRadius: 10, ...continuousRadius(),
            borderWidth: 1, borderColor: '#e2e8f0', padding: 12, fontSize: 14, color: '#0f172a',
          }}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          value={input}
          onChangeText={setInput}
          autoCapitalize="none"
          onSubmitEditing={handleAdd}
        />
        <Pressable
          onPress={handleAdd}
          style={{
            backgroundColor: '#0ea5e9', borderRadius: 10, ...continuousRadius(),
            width: 44, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Plus size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

export default function SiteDetailScreen() {
  const router = useRouter();
  const { id: siteId } = useLocalSearchParams<{ id: string }>();
  const { data: site, isLoading } = useSite(siteId ?? '');
  const updateSite = useUpdateSite();
  const deleteSite = useDeleteSite();
  const regenerateSecret = useRegenerateSecret();
  const activeProvider = useAuthStore(s => s.providers.find(p => p.id === s.activeProviderId));

  const [editName, setEditName] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [platform, setPlatform] = useState<Platform>('html');

  const backButton = (
    <Pressable
      onPress={() => router.replace('/(tabs)/(settings)/')}
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

  useEffect(() => {
    if (site?.name) setEditName(site.name);
  }, [site?.name]);

  if (isLoading || !site) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <Header title="Site Settings" leftElement={backButton} />
        <LoadingState message="Loading site..." />
      </View>
    );
  }

  const isApp = site.type === 'app';
  const SiteIcon = isApp ? Smartphone : Globe;
  const maskedSecret = site.secretKey
    ? `${site.secretKey.slice(0, 6)}...${site.secretKey.slice(-4)}`
    : '••••••';

  const handleSaveName = () => {
    const name = editName.trim();
    if (name && name !== site.name) {
      updateSite.mutate({ siteId: site.siteId, data: { name } });
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Site', 'Are you sure you want to delete this site? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteSite.mutateAsync(site.siteId);
          router.replace('/(tabs)/(settings)/');
        },
      },
    ]);
  };

  const handleRegenerateSecret = () => {
    Alert.alert('Regenerate Secret', 'The old key will stop working immediately. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Regenerate', style: 'destructive',
        onPress: () => regenerateSecret.mutate(site.siteId),
      },
    ]);
  };

  const handleUpdateHostnames = (hostnames: string[]) => {
    updateSite.mutate({ siteId: site.siteId, data: { allowedOrigins: hostnames } });
  };

  const handleUpdateConversions = (events: string[]) => {
    updateSite.mutate({ siteId: site.siteId, data: { conversionEvents: events } });
  };

  const serverUrl = activeProvider?.baseUrl?.replace(/\/$/, '') ?? '';
  const snippet = getSetupSnippet(platform, site.siteId, site.secretKey ?? '', serverUrl);

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <Header title="Site Settings" leftElement={backButton} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
      >
        {/* Header with editable name */}
        <View style={{
          backgroundColor: '#fff', borderRadius: 16, ...continuousRadius(),
          padding: 20, ...cardShadow(),
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <View style={{
              width: 44, height: 44, borderRadius: 12, ...continuousRadius(),
              backgroundColor: isApp ? '#eef2ff' : '#ecfdf5',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <SiteIcon size={22} color={isApp ? '#6366f1' : '#10b981'} />
            </View>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: isApp ? '#eef2ff' : '#ecfdf5',
              borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
            }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: isApp ? '#6366f1' : '#10b981' }}>
                {isApp ? 'Mobile App' : 'Website'}
              </Text>
            </View>
          </View>
          <TextInput
            style={{
              fontSize: 20, fontWeight: '700', color: '#0f172a',
              paddingVertical: 8,
            }}
            value={editName}
            onChangeText={setEditName}
            onBlur={handleSaveName}
            onSubmitEditing={handleSaveName}
            returnKeyType="done"
          />
        </View>

        {/* Site Info */}
        <SectionCard title="Site Info" icon={Globe}>
          <InfoRow label="Site ID" value={site.siteId} mono copyable />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: '#f1f5f9' }}>
            <Text style={{ width: 100, fontSize: 13, color: '#94a3b8', fontWeight: '500' }}>Secret Key</Text>
            <Text selectable style={{ flex: 1, fontSize: 14, color: '#0f172a', fontFamily: 'monospace' }}>
              {showSecret ? site.secretKey : maskedSecret}
            </Text>
            <Pressable onPress={() => setShowSecret(!showSecret)} hitSlop={10} style={{ padding: 4 }}>
              {showSecret ? <EyeOff size={16} color="#94a3b8" /> : <Eye size={16} color="#94a3b8" />}
            </Pressable>
            <Pressable
              onPress={async () => {
                if (site.secretKey) {
                  await Clipboard.setStringAsync(site.secretKey);
                  Alert.alert('Copied', 'Secret key copied to clipboard');
                }
              }}
              hitSlop={10}
              style={{ padding: 4, marginLeft: 4 }}
            >
              <Copy size={16} color="#94a3b8" />
            </Pressable>
          </View>
          {site.domain && <InfoRow label="Domain" value={site.domain} />}
          {site.createdAt && <InfoRow label="Created" value={formatDateTime(site.createdAt)} />}
          {site.updatedAt && <InfoRow label="Updated" value={formatDateTime(site.updatedAt)} />}
        </SectionCard>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={handleRegenerateSecret}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 6, backgroundColor: '#fffbeb', borderRadius: 12, ...continuousRadius(),
              paddingVertical: 14, borderWidth: 1, borderColor: '#fde68a',
            }}
          >
            <RefreshCw size={16} color="#b45309" />
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#b45309' }}>Regenerate</Text>
          </Pressable>
          <Pressable
            onPress={handleDelete}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 6, backgroundColor: '#fef2f2', borderRadius: 12, ...continuousRadius(),
              paddingVertical: 14, borderWidth: 1, borderColor: '#fecaca',
            }}
          >
            <Trash2 size={16} color="#dc2626" />
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#dc2626' }}>Delete Site</Text>
          </Pressable>
        </View>

        {/* Allowed Hostnames */}
        <SectionCard title="Allowed Hostnames" icon={Shield}>
          <Text style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
            {(site.allowedOrigins?.length ?? 0) === 0
              ? 'All hostnames allowed. Add hostnames to restrict access.'
              : 'Only these hostnames can send data to this site.'}
          </Text>
          <TagList
            items={site.allowedOrigins ?? []}
            placeholder="example.com"
            onAdd={(v) => handleUpdateHostnames([...(site.allowedOrigins ?? []), v])}
            onRemove={(v) => handleUpdateHostnames((site.allowedOrigins ?? []).filter(h => h !== v))}
          />
        </SectionCard>

        {/* Conversion Events */}
        <SectionCard title="Conversion Events" icon={Target}>
          <Text style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
            {(site.conversionEvents?.length ?? 0) === 0
              ? 'No conversion events configured. Add event names to track conversions.'
              : 'These events are tracked as conversions.'}
          </Text>
          <TagList
            items={site.conversionEvents ?? []}
            placeholder="signup, purchase..."
            onAdd={(v) => handleUpdateConversions([...(site.conversionEvents ?? []), v])}
            onRemove={(v) => handleUpdateConversions((site.conversionEvents ?? []).filter(e => e !== v))}
          />
        </SectionCard>

        {/* Setup Guide */}
        <SectionCard title="Setup Guide" icon={BookOpen}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, marginBottom: 12 }}
          >
            {PLATFORMS.map(p => (
              <Pressable
                key={p.key}
                onPress={() => setPlatform(p.key)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, ...continuousRadius(),
                  backgroundColor: platform === p.key ? '#0ea5e9' : '#f1f5f9',
                }}
              >
                <Text style={{
                  fontSize: 13, fontWeight: '600',
                  color: platform === p.key ? '#fff' : '#64748b',
                }}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView
            horizontal
            style={{
              backgroundColor: '#1e293b', borderRadius: 10, ...continuousRadius(),
              padding: 14, maxHeight: 260,
            }}
          >
            <Text selectable style={{ fontSize: 13, fontFamily: 'monospace', color: '#e2e8f0', lineHeight: 20 }}>
              {snippet}
            </Text>
          </ScrollView>
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(snippet);
              Alert.alert('Copied', 'Snippet copied to clipboard');
            }}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              marginTop: 10, paddingVertical: 10, borderRadius: 8, ...continuousRadius(),
              backgroundColor: '#f1f5f9',
            }}
          >
            <Copy size={14} color="#64748b" />
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#64748b' }}>Copy Snippet</Text>
          </Pressable>
        </SectionCard>
      </ScrollView>
    </View>
  );
}
