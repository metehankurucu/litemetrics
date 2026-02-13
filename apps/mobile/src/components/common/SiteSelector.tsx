import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { useEffect, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react-native';
import { useAuthStore } from 'src/stores/auth-store';
import { useSites } from 'src/api/hooks/useSites';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';
import type { Site } from '@litemetrics/core';

interface SiteSelectorProps {
  onSiteChange?: (siteId: string) => void;
}

export function SiteSelector({ onSiteChange }: SiteSelectorProps) {
  const { activeSiteId, setActiveSite } = useAuthStore();
  const { data: sites, isLoading } = useSites();
  const [modalVisible, setModalVisible] = useState(false);

  // Auto-select first site when sites load and none is selected
  useEffect(() => {
    if (!activeSiteId && sites?.length) {
      setActiveSite(sites[0].siteId);
      onSiteChange?.(sites[0].siteId);
    }
  }, [sites, activeSiteId]);

  const activeSite = sites?.find(s => s.siteId === activeSiteId) || sites?.[0];

  const handleSelect = (site: Site) => {
    setActiveSite(site.siteId);
    onSiteChange?.(site.siteId);
    setModalVisible(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setModalVisible(true)}
        disabled={isLoading}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
      >
        <Text style={{ fontSize: 15, fontWeight: '500', color: '#0ea5e9' }} numberOfLines={1}>
          {isLoading ? 'Loading...' : activeSite?.name || 'Select Site'}
        </Text>
        <ChevronDown size={16} color="#0ea5e9" />
      </Pressable>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setModalVisible(false)}>
          <View style={{
            backgroundColor: '#fff',
            borderRadius: 18,
            ...continuousRadius(),
            width: '85%',
            maxHeight: '60%',
            padding: 20,
            ...cardShadow(),
          }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#0f172a', marginBottom: 16 }}>
              Select Site
            </Text>
            {isLoading ? (
              <Text style={{ fontSize: 15, color: '#64748b', textAlign: 'center', paddingVertical: 20 }}>
                Loading sites...
              </Text>
            ) : (
              <FlatList
                data={sites}
                keyExtractor={(item) => item.siteId}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => handleSelect(item)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderRadius: 10,
                      ...continuousRadius(),
                      marginBottom: 4,
                      backgroundColor: item.siteId === activeSiteId ? '#f0f9ff' : 'transparent',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        fontSize: 16,
                        fontWeight: '500',
                        color: item.siteId === activeSiteId ? '#0284c7' : '#0f172a',
                      }}>
                        {item.name}
                      </Text>
                      {item.domain ? (
                        <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }} numberOfLines={1}>
                          {item.domain}
                        </Text>
                      ) : null}
                    </View>
                    {item.siteId === activeSiteId && <Check size={18} color="#0284c7" />}
                  </Pressable>
                )}
              />
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
