import { useEffect, useRef, useCallback } from 'react';
import { useInsaytRNContext } from './context';

/**
 * Access the Insayt tracker instance in React Native.
 *
 * @example
 * ```tsx
 * function Button() {
 *   const { track } = useInsayt();
 *   return <Pressable onPress={() => track('tap', { screen: 'home' })}><Text>Tap</Text></Pressable>;
 * }
 * ```
 */
export function useInsayt() {
  const { tracker } = useInsaytRNContext();

  return {
    track: tracker.track.bind(tracker),
    identify: tracker.identify.bind(tracker),
    page: tracker.page.bind(tracker),
    reset: tracker.reset.bind(tracker),
  };
}

/**
 * Track React Navigation screen changes.
 * Returns `onStateChange` and `ref` props for NavigationContainer.
 *
 * @example
 * ```tsx
 * import { NavigationContainer } from '@react-navigation/native';
 *
 * function App() {
 *   const { onStateChange, navigationRef } = useNavigationTracking();
 *   return (
 *     <InsaytProvider siteId="xxx" endpoint="https://api.example.com/collect">
 *       <NavigationContainer ref={navigationRef} onStateChange={onStateChange}>
 *         <Stack.Navigator>...</Stack.Navigator>
 *       </NavigationContainer>
 *     </InsaytProvider>
 *   );
 * }
 * ```
 */
export function useNavigationTracking() {
  const { tracker } = useInsaytRNContext();
  const routeNameRef = useRef<string | undefined>(undefined);
  const navigationRef = useRef<any>(null);

  const onStateChange = useCallback(() => {
    const currentRoute = navigationRef.current?.getCurrentRoute?.();
    const currentRouteName = currentRoute?.name;

    if (currentRouteName && currentRouteName !== routeNameRef.current) {
      routeNameRef.current = currentRouteName;
      tracker.page(currentRouteName);
    }
  }, [tracker]);

  return { onStateChange, navigationRef };
}

/**
 * Track app foreground/background state changes.
 * Sends events when the app goes to background and comes back.
 *
 * @example
 * ```tsx
 * function App() {
 *   useAppStateTracking();
 *   return <MainScreen />;
 * }
 * ```
 */
export function useAppStateTracking() {
  const { tracker } = useInsaytRNContext();
  const appStateRef = useRef<string>('active');

  useEffect(() => {
    let AppState: any;
    let subscription: any;

    // Dynamic import to avoid crash if not in RN environment
    try {
      AppState = require('react-native').AppState;
    } catch {
      return;
    }

    appStateRef.current = AppState.currentState;

    subscription = AppState.addEventListener('change', (nextState: string) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        tracker.track('app_foreground');
      } else if (nextState.match(/inactive|background/)) {
        tracker.track('app_background');
      }
      appStateRef.current = nextState;
    });

    return () => {
      subscription?.remove();
    };
  }, [tracker]);
}
