import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WelcomeScreen() {
  const router = useRouter();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(auth)/add-provider');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Image
          source={require('../../assets/logo.png')}
          style={{ width: 220, height: 110, marginBottom: 24 }}
          resizeMode="contain"
        />
        <Text style={{ fontSize: 34, fontWeight: '800', color: '#0f172a', marginBottom: 8 }}>
          Litemetrics
        </Text>
        <Text style={{ fontSize: 17, color: '#64748b', textAlign: 'center', lineHeight: 24 }}>
          Lightweight, open-source analytics{'\n'}for your apps and websites
        </Text>
      </View>

      <View style={{ padding: 24, paddingBottom: 48 }}>
        <Pressable
          onPress={handlePress}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0ea5e9',
            borderRadius: 14,
            ...continuousRadius(),
            paddingVertical: 16,
            gap: 8,
            ...cardShadow(),
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: '600', color: '#fff' }}>Get Started</Text>
          <ArrowRight size={20} color="#fff" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
