import { Redirect, Tabs } from 'expo-router';
import { ChartBar, Inbox, Users, Settings } from 'lucide-react-native';
import { useAuthStore } from 'src/stores/auth-store';
import { useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const { providers, activeProviderId, adminSecret, _hasHydrated } = useAuthStore();
  const hasProvider = !!activeProviderId && !!adminSecret && providers.length > 0;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  if (!_hasHydrated) return null;
  if (!hasProvider) return <Redirect href="/(auth)/" />;

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#0ea5e9',
      tabBarStyle: {
        paddingTop: 8,
        paddingBottom: insets.bottom,
        height: (Platform.OS === 'android' ? 60 : 88) + insets.bottom,
      },
      tabBarLabelStyle: {
        fontSize: 11,
        fontWeight: '600',
        marginTop: 4,
      },
    }}>
      <Tabs.Screen name="(analytics)" options={{
        title: 'Analytics',
        tabBarIcon: ({ color, size }) => <ChartBar size={size} color={color} />,
      }} />
      <Tabs.Screen name="(events)" options={{
        title: 'Events',
        tabBarIcon: ({ color, size }) => <Inbox size={size} color={color} />,
      }} />
      <Tabs.Screen name="(users)" options={{
        title: 'Users',
        tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
      }} />
      <Tabs.Screen name="(settings)" options={{
        title: 'Settings',
        tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
      }} />
    </Tabs>
  );
}
