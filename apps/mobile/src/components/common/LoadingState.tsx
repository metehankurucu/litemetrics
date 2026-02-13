import { View, ActivityIndicator, Text } from 'react-native';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
      <ActivityIndicator size="large" color="#0ea5e9" />
      <Text style={{ fontSize: 15, color: '#64748b', marginTop: 16 }}>{message}</Text>
    </View>
  );
}
