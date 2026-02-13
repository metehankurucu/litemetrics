import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { useState } from 'react';
import { Plus, SlidersHorizontal, X } from 'lucide-react-native';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';

const FILTER_OPTIONS = [
  { key: 'geo.country', label: 'Country', placeholder: 'US, TR, DE...' },
  { key: 'geo.region', label: 'Region', placeholder: 'California' },
  { key: 'geo.city', label: 'City', placeholder: 'San Francisco' },
  { key: 'language', label: 'Language', placeholder: 'en-US' },
  { key: 'device.type', label: 'Device Type', placeholder: 'desktop, mobile, tablet' },
  { key: 'device.browser', label: 'Browser', placeholder: 'Chrome, Safari...' },
  { key: 'device.os', label: 'OS', placeholder: 'macOS, iOS, Android...' },
  { key: 'device.osVersion', label: 'OS Version', placeholder: '17.0' },
  { key: 'device.deviceModel', label: 'Device Model', placeholder: 'iPhone 15' },
  { key: 'device.deviceBrand', label: 'Device Brand', placeholder: 'Apple, Samsung...' },
  { key: 'device.appVersion', label: 'App Version', placeholder: '1.0.0' },
  { key: 'referrer', label: 'Referrer', placeholder: 'google.com' },
  { key: 'channel', label: 'Channel', placeholder: 'organic, direct...' },
  { key: 'utm.source', label: 'UTM Source', placeholder: 'google, facebook...' },
  { key: 'utm.medium', label: 'UTM Medium', placeholder: 'cpc, organic...' },
  { key: 'utm.campaign', label: 'UTM Campaign', placeholder: 'summer_sale' },
  { key: 'utm.term', label: 'UTM Term', placeholder: 'running shoes' },
  { key: 'utm.content', label: 'UTM Content', placeholder: 'banner_ad' },
  { key: 'eventSource', label: 'Event Source', placeholder: 'auto, manual' },
  { key: 'eventSubtype', label: 'Event Subtype', placeholder: 'link_click, scroll_depth...' },
  { key: 'eventName', label: 'Event Name', placeholder: 'signup' },
  { key: 'eventType', label: 'Event Type', placeholder: 'pageview, event...' },
  { key: 'pagePath', label: 'Page Path', placeholder: '/pricing' },
];

interface Filter {
  key: string;
  value: string;
}

interface SegmentFiltersProps {
  filters: Filter[];
  onChange: (filters: Filter[]) => void;
}

export function SegmentFilters({ filters, onChange }: SegmentFiltersProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [pickingField, setPickingField] = useState(false);
  const activeCount = filters.length;

  const addFilter = (key: string) => {
    if (!filters.find(f => f.key === key)) {
      onChange([...filters, { key, value: '' }]);
    }
    setPickingField(false);
  };

  const updateFilter = (index: number, value: string) => {
    const updated = [...filters];
    updated[index] = { ...updated[index], value };
    onChange(updated);
  };

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    onChange([]);
    setModalVisible(false);
  };

  const usedKeys = new Set(filters.map(f => f.key));
  const availableOptions = FILTER_OPTIONS.filter(o => !usedKeys.has(o.key));

  return (
    <>
      <Pressable
        onPress={() => setModalVisible(true)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, ...continuousRadius(),
          backgroundColor: activeCount > 0 ? '#0ea5e9' : '#f1f5f9',
          alignSelf: 'flex-start',
        }}
      >
        <SlidersHorizontal size={14} color={activeCount > 0 ? '#fff' : '#64748b'} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: activeCount > 0 ? '#fff' : '#64748b' }}>
          Filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </Text>
      </Pressable>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="formSheet">
        <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            padding: 20, paddingTop: 28, borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
            backgroundColor: '#fff',
          }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#0f172a' }}>Segment Filters</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {activeCount > 0 && (
                <Pressable onPress={clearAll}>
                  <Text style={{ fontSize: 14, color: '#ef4444', fontWeight: '500' }}>Clear</Text>
                </Pressable>
              )}
              <Pressable onPress={() => setModalVisible(false)}>
                <Text style={{ fontSize: 14, color: '#0ea5e9', fontWeight: '600' }}>Done</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
            {/* Active filters */}
            {filters.map((filter, idx) => {
              const option = FILTER_OPTIONS.find(o => o.key === filter.key);
              return (
                <View key={`${filter.key}-${idx}`} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: '#fff', borderRadius: 12, ...continuousRadius(),
                  padding: 12, ...cardShadow(),
                }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155', width: 100 }}>
                    {option?.label ?? filter.key}
                  </Text>
                  <TextInput
                    style={{
                      flex: 1, backgroundColor: '#f8fafc', borderRadius: 8, ...continuousRadius(),
                      borderWidth: 1, borderColor: '#e2e8f0', padding: 10, fontSize: 13, color: '#0f172a',
                    }}
                    placeholder={option?.placeholder ?? 'Value...'}
                    placeholderTextColor="#94a3b8"
                    value={filter.value}
                    onChangeText={(v) => updateFilter(idx, v)}
                    autoCapitalize="none"
                  />
                  <Pressable onPress={() => removeFilter(idx)} hitSlop={8}>
                    <X size={18} color="#94a3b8" />
                  </Pressable>
                </View>
              );
            })}

            {/* Add filter button / picker */}
            {pickingField ? (
              <View style={{
                backgroundColor: '#fff', borderRadius: 12, ...continuousRadius(),
                maxHeight: 300, ...cardShadow(),
              }}>
                <FlatList
                  data={availableOptions}
                  keyExtractor={(item) => item.key}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => addFilter(item.key)}
                      style={{ padding: 14 }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '500', color: '#0f172a' }}>{item.label}</Text>
                      <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{item.placeholder}</Text>
                    </Pressable>
                  )}
                  ItemSeparatorComponent={() => <View style={{ height: 0.5, backgroundColor: '#f1f5f9' }} />}
                />
              </View>
            ) : (
              <Pressable
                onPress={() => setPickingField(true)}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  paddingVertical: 14, borderRadius: 12, ...continuousRadius(),
                  borderWidth: 1.5, borderColor: '#e2e8f0', borderStyle: 'dashed',
                }}
              >
                <Plus size={16} color="#64748b" />
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#64748b' }}>Add Filter</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
