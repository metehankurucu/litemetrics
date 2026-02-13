import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { continuousRadius } from 'src/theme/platform-style';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
      <View style={{
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#f0f9ff',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
      }}>
        <Icon size={36} color="#94a3b8" />
      </View>
      <Text style={{ fontSize: 18, fontWeight: '600', color: '#0f172a', textAlign: 'center', marginBottom: 8 }}>
        {title}
      </Text>
      {description && (
        <Text style={{ fontSize: 15, color: '#64748b', textAlign: 'center', marginBottom: 20 }}>
          {description}
        </Text>
      )}
      {action && (
        <Pressable
          onPress={action.onPress}
          style={{
            backgroundColor: '#0ea5e9',
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 10,
            ...continuousRadius(),
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
