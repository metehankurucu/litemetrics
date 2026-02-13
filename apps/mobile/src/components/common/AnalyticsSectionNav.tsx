import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Activity, ChartBar, ChevronRight, Megaphone, RefreshCcw, TrendingUp, type LucideIcon } from 'lucide-react-native';
import { continuousRadius } from 'src/theme/platform-style';

type SectionKey = 'index' | 'realtime' | 'insights' | 'campaigns' | 'retention';

interface SectionItem {
  key: SectionKey;
  title: string;
  route: string;
  icon: LucideIcon;
}

const SECTIONS: SectionItem[] = [
  {
    key: 'index',
    title: 'Analytics',
    route: '/(tabs)/(analytics)/',
    icon: ChartBar,
  },
  {
    key: 'realtime',
    title: 'Realtime',
    route: '/(tabs)/(analytics)/realtime',
    icon: Activity,
  },
  {
    key: 'insights',
    title: 'Insights',
    route: '/(tabs)/(analytics)/insights',
    icon: TrendingUp,
  },
  {
    key: 'campaigns',
    title: 'Campaigns',
    route: '/(tabs)/(analytics)/campaigns',
    icon: Megaphone,
  },
  {
    key: 'retention',
    title: 'Retention',
    route: '/(tabs)/(analytics)/retention',
    icon: RefreshCcw,
  },
];

interface AnalyticsSectionNavProps {
  active: SectionKey;
}

export function AnalyticsSectionNav({ active }: AnalyticsSectionNavProps) {
  const router = useRouter();

  return (
    <View style={{ gap: 4 }}>
      {SECTIONS.map((section) => {
        const isActive = section.key === active;
        const Icon = section.icon;

        return (
          <Pressable
            key={section.key}
            onPress={() => {
              if (!isActive) {
                router.push(section.route as any);
              }
            }}
            disabled={isActive}
            style={{
              width: '100%',
              borderRadius: 10,
              ...continuousRadius(),
              borderWidth: 1,
              borderColor: isActive ? '#0ea5e9' : '#e2e8f0',
              backgroundColor: isActive ? '#0ea5e9' : '#ffffff',
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon size={16} color={isActive ? '#ffffff' : '#0f172a'} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: isActive ? '#ffffff' : '#0f172a' }}>
                  {section.title}
                </Text>
              </View>
              {!isActive && <ChevronRight size={16} color="#94a3b8" />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
