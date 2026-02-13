import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react-native';
import { useAuthStore } from 'src/stores/auth-store';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';

interface ProviderPickerProps {
  onAddPress?: () => void;
}

export function ProviderPicker({ onAddPress }: ProviderPickerProps) {
  const { providers, activeProviderId, setActiveProvider, adminSecret } = useAuthStore();
  const [modalVisible, setModalVisible] = useState(false);

  const activeProvider = providers.find(p => p.id === activeProviderId);

  return (
    <>
      <Pressable
        onPress={() => setModalVisible(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: '#f8fafc',
          borderRadius: 10,
          ...continuousRadius(),
          borderWidth: 1,
          borderColor: '#e2e8f0',
        }}
      >
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: '#0f172a' }} numberOfLines={1}>
          {activeProvider?.name || 'Select Provider'}
        </Text>
        <ChevronDown size={18} color="#64748b" />
      </Pressable>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}
          onPress={() => setModalVisible(false)}
        >
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
              Select Provider
            </Text>
            <FlatList
              data={providers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    const secret = providers.find(p => p.id === item.id)?.baseUrl === activeProvider?.baseUrl
                      ? adminSecret
                      : undefined;
                    setActiveProvider(item.id, secret || '');
                    setModalVisible(false);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                    ...continuousRadius(),
                    marginBottom: 4,
                    backgroundColor: item.id === activeProviderId ? '#f0f9ff' : 'transparent',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      fontSize: 16,
                      fontWeight: '500',
                      color: item.id === activeProviderId ? '#0284c7' : '#0f172a',
                    }}>
                      {item.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }} numberOfLines={1}>
                      {item.baseUrl}
                    </Text>
                  </View>
                  {item.id === activeProviderId && <Check size={18} color="#0284c7" />}
                </Pressable>
              )}
            />
            <Pressable
              onPress={() => {
                setModalVisible(false);
                onAddPress?.();
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 14,
                marginTop: 8,
                borderTopWidth: 1,
                borderTopColor: '#f1f5f9',
                gap: 8,
              }}
            >
              <Plus size={18} color="#0ea5e9" />
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#0ea5e9' }}>Add Provider</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
