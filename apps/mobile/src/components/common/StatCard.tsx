import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: LucideIcon;
  iconColor?: string;
}

export function StatCard({ title, value, change, icon: Icon, iconColor = '#0ea5e9' }: StatCardProps) {
  return (
    <View style={{
      backgroundColor: '#fff',
      borderRadius: 14,
      ...continuousRadius(),
      padding: 16,
      ...cardShadow(),
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <View style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          ...continuousRadius(),
          backgroundColor: iconColor + '20',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <Icon size={18} color={iconColor} />
        </View>
        <Text style={{ fontSize: 14, fontWeight: '500', color: '#64748b' }}>{title}</Text>
      </View>
      <Text selectable style={{
        fontSize: 28,
        fontWeight: '700',
        color: '#0f172a',
        fontVariant: ['tabular-nums'],
        marginBottom: 4,
      }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </Text>
      <View style={{ height: 18, justifyContent: 'center' }}>
        {change !== undefined && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{
              fontSize: 13,
              fontWeight: '600',
              color: change >= 0 ? '#10b981' : '#ef4444',
              fontVariant: ['tabular-nums'],
            }}>
              {change >= 0 ? '+' : ''}{change.toFixed(1)}%
            </Text>
            <Text style={{ fontSize: 13, color: '#94a3b8' }}>vs last period</Text>
          </View>
        )}
      </View>
    </View>
  );
}
