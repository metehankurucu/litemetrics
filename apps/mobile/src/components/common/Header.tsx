import { View, Text, ScrollView, Pressable, FlatList, Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { continuousRadius } from 'src/theme/platform-style';

interface HeaderProps {
  title: string;
  leftElement?: ReactNode;
  rightElement?: ReactNode;
  searchBar?: {
    placeholder: string;
    value: string;
    onChangeText: (text: string) => void;
  };
}

export function Header({ title, leftElement, rightElement, searchBar }: HeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#f8fafc' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
          {leftElement}
          <Text style={{ fontSize: 34, fontWeight: '800', color: '#0f172a' }} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {rightElement}
      </View>
      {searchBar && (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#e2e8f0',
          borderRadius: 10,
          ...continuousRadius(),
          paddingHorizontal: 10,
          marginTop: 12,
          gap: 6,
        }}>
          <Search size={16} color="#94a3b8" />
          <TextInput
            style={{ flex: 1, paddingVertical: 10, fontSize: 15, color: '#0f172a' }}
            placeholder={searchBar.placeholder}
            placeholderTextColor="#94a3b8"
            value={searchBar.value}
            onChangeText={searchBar.onChangeText}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      )}
    </View>
  );
}
