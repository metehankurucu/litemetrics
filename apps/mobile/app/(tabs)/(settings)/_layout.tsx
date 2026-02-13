import Stack from 'expo-router/stack';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="site/[id]" />
    </Stack>
  );
}
