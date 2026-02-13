import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { format, parseISO } from 'date-fns';
import { LineChart } from 'react-native-gifted-charts';
import type { TimeSeriesPoint } from '@litemetrics/core';
import type { LucideIcon } from 'lucide-react-native';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';

interface TimeSeriesChartProps {
  data: TimeSeriesPoint[];
  color?: string;
  title?: string;
  icon?: LucideIcon;
}

function formatChartDate(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    return format(d, 'd MMM');
  } catch {
    return dateStr;
  }
}

export function TimeSeriesChart({ data, color = '#0ea5e9', title, icon: Icon }: TimeSeriesChartProps) {
  const labelInterval = Math.max(1, Math.floor(data.length / 5));
  const formattedData = data.map((point, i) => ({
    value: point.value,
    label: i % labelInterval === 0 ? formatChartDate(point.date) : '',
    date: point.date,
  }));

  return (
    <View style={{
      backgroundColor: '#fff',
      borderRadius: 14,
      ...continuousRadius(),
      padding: 16,
      ...cardShadow(),
    }}>
      {title && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          {Icon && <Icon size={16} color="#64748b" />}
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#0f172a' }}>
            {title}
          </Text>
        </View>
      )}
      <LineChart
        data={formattedData}
        height={200}
        color={color}
        thickness={2}
        curved
        areaChart
        startFillColor={color}
        startOpacity={0.3}
        endOpacity={0}
        hideAxesAndRules={false}
        xAxisColor="#e2e8f0"
        yAxisColor="#e2e8f0"
        rulesColor="#f1f5f9"
        xAxisLabelTextStyle={{ fontSize: 10, color: '#94a3b8' }}
        yAxisTextStyle={{ fontSize: 10, color: '#94a3b8' }}
        spacing={data.length > 14 ? 40 : 60}
        pointerConfig={{
          pointerColor: color,
          showPointerStrip: true,
          pointerStripColor: color,
        }}
      />
    </View>
  );
}
