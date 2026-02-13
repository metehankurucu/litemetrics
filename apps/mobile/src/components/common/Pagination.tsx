import { Pressable, Text, View } from 'react-native';
import { cardShadow, continuousRadius } from 'src/theme/platform-style';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}

export function Pagination({ page, totalPages, onPrevious, onNext }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16,
      paddingVertical: 12,
    }}>
      <Pressable
        onPress={() => {
          if (page > 0) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPrevious();
          }
        }}
        disabled={page === 0}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 4,
          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, ...continuousRadius(),
          backgroundColor: page === 0 ? '#f1f5f9' : '#fff',
          opacity: page === 0 ? 0.5 : 1,
          ...(page === 0 ? {} : cardShadow()),
        }}
      >
        <ChevronLeft size={16} color={page === 0 ? '#94a3b8' : '#0f172a'} />
        <Text style={{ fontSize: 14, fontWeight: '500', color: page === 0 ? '#94a3b8' : '#0f172a' }}>Prev</Text>
      </Pressable>

      <Text style={{ fontSize: 13, color: '#64748b', fontVariant: ['tabular-nums'] }}>
        {page + 1} / {totalPages}
      </Text>

      <Pressable
        onPress={() => {
          if (page < totalPages - 1) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onNext();
          }
        }}
        disabled={page >= totalPages - 1}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 4,
          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, ...continuousRadius(),
          backgroundColor: page >= totalPages - 1 ? '#f1f5f9' : '#fff',
          opacity: page >= totalPages - 1 ? 0.5 : 1,
          ...(page >= totalPages - 1 ? {} : cardShadow()),
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '500', color: page >= totalPages - 1 ? '#94a3b8' : '#0f172a' }}>Next</Text>
        <ChevronRight size={16} color={page >= totalPages - 1 ? '#94a3b8' : '#0f172a'} />
      </Pressable>
    </View>
  );
}
