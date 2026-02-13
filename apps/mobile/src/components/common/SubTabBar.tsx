import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { continuousRadius } from 'src/theme/platform-style';

const TABS = [
  { key: 'index', label: 'Analytics', route: '/(tabs)/(analytics)/' },
  { key: 'realtime', label: 'Realtime', route: '/(tabs)/(analytics)/realtime' },
  { key: 'insights', label: 'Insights', route: '/(tabs)/(analytics)/insights' },
  { key: 'campaigns', label: 'Campaigns', route: '/(tabs)/(analytics)/campaigns' },
  { key: 'retention', label: 'Retention', route: '/(tabs)/(analytics)/retention' },
] as const;

interface SubTabBarProps {
  active: string;
}

export function SubTabBar({ active }: SubTabBarProps) {
  const router = useRouter();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {TABS.map(tab => {
        const isActive = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            onPress={() => {
              if (!isActive) {
                if (tab.key === 'index') {
                  router.back();
                } else {
                  router.push(tab.route as any);
                }
              }
            }}
            style={{
              paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, ...continuousRadius(),
              backgroundColor: isActive ? '#0ea5e9' : '#f1f5f9',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: isActive ? '#fff' : '#64748b' }}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
