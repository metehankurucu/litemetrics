import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import type { QueryDataPoint } from '@litemetrics/core';
import type { LucideIcon } from 'lucide-react-native';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';
import { formatNumber } from 'src/lib/format';

interface PieChartCardProps {
  title: string;
  data: QueryDataPoint[];
  icon?: LucideIcon;
  iconColor?: string;
}

const COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];

export function PieChartCard({ title, data, icon: Icon, iconColor = '#64748b' }: PieChartCardProps) {
  const chartData = data.slice(0, 8).map((item, index) => ({
    value: item.value,
    color: COLORS[index % COLORS.length],
    text: item.key.length > 15 ? item.key.slice(0, 15) + '...' : item.key,
  }));

  const total = data.reduce((sum, item) => sum + item.value, 0);

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
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <PieChart
          data={chartData}
          radius={80}
          innerRadius={50}
          centerLabelComponent={() => (
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Text selectable style={{
                fontSize: 18,
                fontWeight: '700',
                color: '#0f172a',
                fontVariant: ['tabular-nums'],
              }}>
                {formatNumber(total)}
              </Text>
              <Text style={{ fontSize: 12, color: '#64748b' }}>Total</Text>
            </View>
          )}
        />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {chartData.map((item, index) => (
          <View key={index} style={{ flexDirection: 'row', alignItems: 'center', width: '45%' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color, marginRight: 6 }} />
            <Text style={{ fontSize: 12, color: '#64748b', flex: 1 }} numberOfLines={1}>{item.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
