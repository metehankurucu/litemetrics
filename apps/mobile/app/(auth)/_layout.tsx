import { Redirect } from 'expo-router';
import Stack from 'expo-router/stack';
import { useAuthStore } from 'src/stores/auth-store';

export default function AuthLayout() {
  const { providers, activeProviderId, adminSecret, _hasHydrated } = useAuthStore();
  const hasProvider = !!activeProviderId && !!adminSecret && providers.length > 0;

  if (!_hasHydrated) return null;
  if (hasProvider) return <Redirect href="/(tabs)/(analytics)/" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="add-provider" />
    </Stack>
  );
}
