import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { useUIStore, Period } from '../../stores/ui-store';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';

const periods: { label: string; value: Period }[] = [
  { label: '1H', value: '1h' },
  { label: '24H', value: '24h' },
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
];

export function PeriodSelector() {
  const { period, setPeriod } = useUIStore();

  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: '#f1f5f9',
      borderRadius: 10,
      ...continuousRadius(),
      padding: 4,
    }}>
      {periods.map((p) => (
        <Pressable
          key={p.value}
          onPress={() => setPeriod(p.value)}
          style={{
            flex: 1,
            paddingVertical: 7,
            borderRadius: 8,
            ...continuousRadius(),
            alignItems: 'center',
            ...(period === p.value ? {
              backgroundColor: '#fff',
              ...cardShadow(),
            } : {}),
          }}
        >
          <Text style={{
            fontSize: 12,
            fontWeight: '600',
            color: period === p.value ? '#0f172a' : '#64748b',
          }}>
            {p.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
