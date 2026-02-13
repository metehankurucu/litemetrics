import { QueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import { focusManager } from '@tanstack/react-query';

onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

focusManager.setFocused(Platform.OS === 'web' ? true : AppState.currentState === 'active');

AppState.addEventListener('change', (status) => {
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active');
  }
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      gcTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
    },
  },
});
