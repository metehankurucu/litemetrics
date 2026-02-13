import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Server, Trash2, Globe, Plus, LogOut, XCircle, ChevronRight, Settings, Smartphone } from 'lucide-react-native';
import { useAuthStore } from 'src/stores/auth-store';
import { useSites, useCreateSite } from 'src/api/hooks/useSites';
import { Header } from 'src/components/common/Header';
import { EmptyState } from 'src/components/common/EmptyState';
import type { Site, SiteType } from '@litemetrics/core';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';

export default function SettingsScreen() {
  const router = useRouter();
  const { providers, activeProviderId, removeProvider } = useAuthStore();
  const { data: sites, refetch: refetchSites } = useSites();
  const createSiteMutation = useCreateSite();

  const [siteModalVisible, setSiteModalVisible] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteDomain, setNewSiteDomain] = useState('');
  const [newSiteType, setNewSiteType] = useState<SiteType>('web');
  const [refreshing, setRefreshing] = useState(false);

  const activeProvider = providers.find((p) => p.id === activeProviderId);

  const handleDeleteProvider = (id: string) => {
    Alert.alert('Remove Provider', 'Are you sure you want to remove this provider?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeProvider(id) },
    ]);
  };

  const handleCreateSite = async () => {
    if (!newSiteName.trim()) {
      Alert.alert('Error', 'Please enter a site name');
      return;
    }
    try {
      await createSiteMutation.mutateAsync({
        name: newSiteName.trim(),
        type: newSiteType,
        domain: newSiteDomain.trim() || undefined,
      });
      setSiteModalVisible(false);
      setNewSiteName('');
      setNewSiteDomain('');
      setNewSiteType('web');
    } catch {
      Alert.alert('Error', 'Failed to create site');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetchSites();
    } finally {
      setRefreshing(false);
    }
  };

  if (!activeProviderId) {
    return (
      <>
        <Header title="Settings" />
        <EmptyState icon={Settings} title="No Provider" description="Please add a provider" />
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <Header title="Settings" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Provider */}
        <View>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Provider
          </Text>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#fff',
            borderRadius: 14,
            ...continuousRadius(),
            padding: 16,
            gap: 12,
            ...cardShadow(),
          }}>
            <View style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              ...continuousRadius(),
              backgroundColor: '#f0f9ff',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Server size={20} color="#0ea5e9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#0f172a' }}>{activeProvider?.name ?? 'Unknown'}</Text>
              <Text selectable style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{activeProvider?.baseUrl ?? ''}</Text>
            </View>
            <Pressable onPress={() => handleDeleteProvider(activeProviderId)} hitSlop={12}>
              <Trash2 size={18} color="#ef4444" />
            </Pressable>
          </View>
        </View>

        {/* Sites */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Sites
            </Text>
            <Pressable
              onPress={() => setSiteModalVisible(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#0ea5e9',
                borderRadius: 8,
                ...continuousRadius(),
                paddingHorizontal: 12,
                paddingVertical: 7,
                gap: 4,
              }}
            >
              <Plus size={14} color="#fff" />
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Add Site</Text>
            </Pressable>
          </View>
          {Array.isArray(sites) && sites.length > 0 ? (
            <View style={{ gap: 8 }}>
              {sites.map((site: Site) => {
                const isApp = site.type === 'app';
                const SiteIcon = isApp ? Smartphone : Globe;
                return (
                  <Pressable
                    key={site.siteId}
                    onPress={() => router.push({ pathname: '/(tabs)/(settings)/site/[id]', params: { id: site.siteId } })}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#fff',
                      borderRadius: 12,
                      ...continuousRadius(),
                      padding: 16,
                      gap: 12,
                      ...cardShadow(),
                    }}
                  >
                    <View style={{
                      width: 36, height: 36, borderRadius: 10, ...continuousRadius(),
                      backgroundColor: isApp ? '#eef2ff' : '#ecfdf5',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <SiteIcon size={18} color={isApp ? '#6366f1' : '#10b981'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '500', color: '#0f172a' }}>{site.name ?? 'Unnamed'}</Text>
                      <Text style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                        {site.domain || 'No domain'} · {isApp ? 'Mobile App' : 'Website'}
                      </Text>
                    </View>
                    <ChevronRight size={16} color="#cbd5e1" />
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <EmptyState icon={Globe} title="No Sites" description="Create your first site" />
          )}
        </View>

        {/* Account */}
        <View>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Account
          </Text>
          <Pressable
            onPress={() => {
              removeProvider(activeProviderId);
              router.replace('/(auth)/');
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#fef2f2',
              borderRadius: 12,
              ...continuousRadius(),
              paddingVertical: 14,
              gap: 8,
            }}
          >
            <LogOut size={18} color="#ef4444" />
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#ef4444' }}>Sign Out</Text>
          </Pressable>
        </View>

        {/* Create Site Modal */}
        <Modal visible={siteModalVisible} animationType="slide" presentationStyle="formSheet">
          <View style={{ flex: 1, padding: 24, paddingTop: 32 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#0f172a' }}>New Site</Text>
              <Pressable onPress={() => setSiteModalVisible(false)}>
                <XCircle size={28} color="#94a3b8" />
              </Pressable>
            </View>
            <View style={{ gap: 16 }}>
              {/* Site Name */}
              <View>
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 }}>Site Name</Text>
                <TextInput
                  style={{
                    backgroundColor: '#f8fafc', borderRadius: 10, ...continuousRadius(),
                    borderWidth: 1, borderColor: '#e2e8f0', padding: 14, fontSize: 15, color: '#0f172a',
                  }}
                  placeholder="My Website"
                  placeholderTextColor="#94a3b8"
                  value={newSiteName}
                  onChangeText={setNewSiteName}
                />
              </View>

              {/* Type Selector */}
              <View>
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 }}>Type</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    onPress={() => setNewSiteType('web')}
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      paddingVertical: 14, borderRadius: 10, ...continuousRadius(),
                      borderWidth: 2,
                      borderColor: newSiteType === 'web' ? '#10b981' : '#e2e8f0',
                      backgroundColor: newSiteType === 'web' ? '#ecfdf5' : '#fff',
                    }}
                  >
                    <Globe size={20} color={newSiteType === 'web' ? '#10b981' : '#94a3b8'} />
                    <Text style={{
                      fontSize: 15, fontWeight: '600',
                      color: newSiteType === 'web' ? '#10b981' : '#64748b',
                    }}>Website</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setNewSiteType('app')}
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      paddingVertical: 14, borderRadius: 10, ...continuousRadius(),
                      borderWidth: 2,
                      borderColor: newSiteType === 'app' ? '#6366f1' : '#e2e8f0',
                      backgroundColor: newSiteType === 'app' ? '#eef2ff' : '#fff',
                    }}
                  >
                    <Smartphone size={20} color={newSiteType === 'app' ? '#6366f1' : '#94a3b8'} />
                    <Text style={{
                      fontSize: 15, fontWeight: '600',
                      color: newSiteType === 'app' ? '#6366f1' : '#64748b',
                    }}>Mobile App</Text>
                  </Pressable>
                </View>
              </View>

              {/* Domain / Bundle ID */}
              <View>
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 }}>
                  {newSiteType === 'app' ? 'Bundle ID' : 'Domain'}
                </Text>
                <TextInput
                  style={{
                    backgroundColor: '#f8fafc', borderRadius: 10, ...continuousRadius(),
                    borderWidth: 1, borderColor: '#e2e8f0', padding: 14, fontSize: 15, color: '#0f172a',
                  }}
                  placeholder={newSiteType === 'app' ? 'com.myapp.example (optional)' : 'example.com (optional)'}
                  placeholderTextColor="#94a3b8"
                  value={newSiteDomain}
                  onChangeText={setNewSiteDomain}
                  autoCapitalize="none"
                />
              </View>

              <Pressable
                onPress={handleCreateSite}
                style={{
                  backgroundColor: '#0ea5e9', borderRadius: 10, ...continuousRadius(),
                  paddingVertical: 16, alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>Create Site</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
}
