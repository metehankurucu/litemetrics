# React Native / Expo Integration

## Install

```bash
npm install @litemetrics/react-native
```

Peer dependencies: `react >= 18`, `react-native >= 0.72`

## Provider Setup

```tsx
import { LitemetricsProvider } from '@litemetrics/react-native';

function App() {
  return (
    <LitemetricsProvider
      siteId="your-site-id"
      endpoint="https://your-server.com/api/collect"
    >
      <YourApp />
    </LitemetricsProvider>
  );
}
```

## Navigation Tracking (React Navigation)

```tsx
import { useNavigationTracking } from '@litemetrics/react-native';
import { NavigationContainer } from '@react-navigation/native';

function AppNavigator() {
  const { onStateChange, navigationRef } = useNavigationTracking();

  return (
    <NavigationContainer ref={navigationRef} onStateChange={onStateChange}>
      {/* screens */}
    </NavigationContainer>
  );
}
```

## App State Tracking

Tracks foreground/background transitions:

```tsx
import { useAppStateTracking } from '@litemetrics/react-native';

function App() {
  useAppStateTracking();
  return <YourApp />;
}
```

## Manual Tracking

```tsx
import { useLitemetrics } from '@litemetrics/react-native';

function PurchaseButton() {
  const { track, identify } = useLitemetrics();

  return (
    <Button
      title="Buy"
      onPress={() => track('purchase', { amount: 9.99 })}
    />
  );
}
```

## Exports

```ts
export { LitemetricsProvider } from './context';
export { useLitemetrics, useNavigationTracking, useAppStateTracking } from './hooks';
export { createRNTracker } from './tracker';
```
