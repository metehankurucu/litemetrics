import { Platform } from 'react-native';
import type { ViewStyle } from 'react-native';

type ShadowLevel = 'sm' | 'md' | 'lg';

const IOS_SHADOWS: Record<ShadowLevel, ViewStyle> = {
  sm: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  lg: {
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
};

const ANDROID_ELEVATION: Record<ShadowLevel, ViewStyle> = {
  sm: { elevation: 2 },
  md: { elevation: 4 },
  lg: { elevation: 8 },
};

export function cardShadow(level: ShadowLevel = 'sm'): ViewStyle {
  return Platform.OS === 'android' ? ANDROID_ELEVATION[level] : IOS_SHADOWS[level];
}

export function continuousRadius(): ViewStyle {
  if (Platform.OS !== 'ios') return {};
  return { borderCurve: 'continuous' };
}
