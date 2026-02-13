import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import type { QueryDataPoint } from '@litemetrics/core';
import type { LucideIcon } from 'lucide-react-native';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';
import { formatNumber } from 'src/lib/format';

interface TopListProps {
  title: string;
  data: QueryDataPoint[];
  unit?: string;
  icon?: LucideIcon;
  iconColor?: string;
}

export function TopList({ title, data, unit, icon: Icon, iconColor = '#64748b' }: TopListProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <View style={{
      backgroundColor: '#fff',
      borderRadius: 14,
      ...continuousRadius(),
      padding: 16,
      ...cardShadow(),
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {Icon && <Icon size={16} color={iconColor} />}
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#0f172a' }}>
          {title}
        </Text>
      </View>
      {data.slice(0, 10).map((item, index) => {
        const percentage = (item.value / maxValue) * 100;
        return (
          <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 }}>
              <Text style={{
                width: 24,
                fontSize: 13,
                fontWeight: '600',
                color: '#94a3b8',
                textAlign: 'center',
                fontVariant: ['tabular-nums'],
              }}>
                {index + 1}
              </Text>
              <Text selectable style={{ flex: 1, fontSize: 14, color: '#0f172a', marginLeft: 8 }} numberOfLines={1}>
                {item.key}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: 120 }}>
              <View style={{
                flex: 1,
                height: 6,
                backgroundColor: '#f1f5f9',
                borderRadius: 3,
                marginRight: 8,
                overflow: 'hidden',
              }}>
                <View style={{
                  height: '100%',
                  width: `${percentage}%`,
                  backgroundColor: '#0ea5e9',
                  borderRadius: 3,
                }} />
              </View>
              <Text selectable style={{
                fontSize: 14,
                fontWeight: '600',
                color: '#0f172a',
                width: 60,
                textAlign: 'right',
                fontVariant: ['tabular-nums'],
              }}>
                {formatNumber(item.value)}
                {unit && <Text style={{ fontSize: 12, fontWeight: '400', color: '#64748b' }}> {unit}</Text>}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
