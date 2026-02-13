import { View, ActivityIndicator } from "react-native";
import { Slot } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "src/api/query-client";
import { useAuthStore } from "src/stores/auth-store";

export default function RootLayout() {
  const { _hasHydrated } = useAuthStore();

  if (!_hasHydrated) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#f8fafc",
        }}
      >
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Slot />
    </QueryClientProvider>
  );
}
