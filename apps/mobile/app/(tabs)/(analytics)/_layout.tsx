import Stack from 'expo-router/stack';

export default function AnalyticsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="realtime" />
      <Stack.Screen name="insights" />
      <Stack.Screen name="campaigns" />
      <Stack.Screen name="retention" />
    </Stack>
  );
}
