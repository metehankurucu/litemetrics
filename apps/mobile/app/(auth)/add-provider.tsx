import {
  View,
  Text,
  ScrollView,
  Pressable,
  FlatList,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  Image,
  Alert,
  RefreshControl,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import {
  Tag,
  Link2,
  KeyRound,
  PlusCircle,
  type LucideIcon,
} from "lucide-react-native";
import { useAuthStore } from "src/stores/auth-store";
import { createSitesClientForProvider } from "src/api/client";
import * as Crypto from "expo-crypto";
import { cardShadow, continuousRadius } from "src/theme/platform-style";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AddProviderScreen() {
  const router = useRouter();
  const { addProvider } = useAuthStore();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [adminSecret, setAdminSecret] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleAdd = async () => {
    if (!name.trim() || !baseUrl.trim() || !adminSecret.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    const url = baseUrl.trim().replace(/\/$/, "");
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "Please enter a valid URL (http:// or https://)");
      return;
    }

    setIsLoading(true);
    try {
      const client = createSitesClientForProvider(url, adminSecret);
      const result = await client.listSites();
      if (!result?.sites) {
        throw new Error(
          `Unexpected response: ${JSON.stringify(result).slice(0, 200)}`
        );
      }
      const id = Crypto.randomUUID();
      await addProvider({ id, name: name.trim(), baseUrl: url, adminSecret });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)/(analytics)/");
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = err?.response?.data
        ? `Status ${err.response.status}: ${typeof err.response.data === "string" ? err.response.data.slice(0, 200) : JSON.stringify(err.response.data).slice(0, 200)}`
        : err?.message || "Unknown error";
      Alert.alert("Connection Failed", message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"}
      >
        <View
          style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}
        >
          <Image
            source={require("../../assets/logo.png")}
            style={{
              width: 200,
              height: 100,
              alignSelf: "center",
              marginBottom: 16,
            }}
            resizeMode="contain"
          />
          <Text
            style={{
              fontSize: 15,
              color: "#64748b",
              marginBottom: 24,
              textAlign: "center",
            }}
          >
            Connect to your Litemetrics server
          </Text>

          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              ...continuousRadius(),
              padding: 20,
              gap: 20,
              ...cardShadow(),
            }}
          >
            <FormField
              label="Provider Name"
              icon={Tag}
              placeholder="My Analytics"
              value={name}
              onChangeText={setName}
            />
            <FormField
              label="Server URL"
              icon={Link2}
              placeholder="https://analytics.myapp.com"
              value={baseUrl}
              onChangeText={setBaseUrl}
              keyboardType="url"
            />
            <FormField
              label="Admin Secret"
              icon={KeyRound}
              placeholder="Enter your admin secret"
              value={adminSecret}
              onChangeText={setAdminSecret}
              secureTextEntry
            />

            <Pressable
              onPress={handleAdd}
              disabled={isLoading}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#0ea5e9",
                borderRadius: 12,
                ...continuousRadius(),
                paddingVertical: 16,
                gap: 8,
                opacity: isLoading ? 0.7 : 1,
                marginTop: 4,
              }}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <PlusCircle size={20} color="#fff" />
              )}
              <Text style={{ fontSize: 17, fontWeight: "600", color: "#fff" }}>
                {isLoading ? "Connecting..." : "Add Provider"}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FormField({
  label,
  icon: Icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
}: {
  label: string;
  icon: LucideIcon;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "url" | "email-address";
}) {
  return (
    <View>
      <Text
        style={{
          fontSize: 14,
          fontWeight: "500",
          color: "#374151",
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#f8fafc",
          borderRadius: 10,
          ...continuousRadius(),
          borderWidth: 1,
          borderColor: "#e2e8f0",
          paddingLeft: 12,
        }}
      >
        <Icon size={16} color="#94a3b8" />
        <TextInput
          style={{
            flex: 1,
            paddingVertical: 14,
            paddingHorizontal: 10,
            fontSize: 15,
            color: "#0f172a",
          }}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="none"
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
        />
      </View>
    </View>
  );
}
