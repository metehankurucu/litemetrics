# @litemetrics/react-native

React Native / Expo bindings for Litemetrics analytics. Provider, hooks, and automatic navigation tracking.

## Installation

```bash
npm install @litemetrics/react-native
```

## Quick Start

> **The site must be typed `app`.** Create it with `litemetrics sites create -n "My App" --type app` or `POST /api/sites` `{"type":"app"}` (existing site: `PUT /api/sites/:siteId {"type":"app"}`). The SDK sends its own `User-Agent: litemetrics-react-native/<version> (<platform>)` on every request, which keeps it off the `isbot` list that Android's default `okhttp/<version>` lands on. That is not enough on its own: the server's bot filter treats a `web` site's traffic as browser traffic, and on Android the SDK's request trips Layer 2 (no browser, no engine, no `Accept-Language`, no `Referer`; OkHttp adds neither header), so `standard` hides that traffic from every report and `strict` drops it. iOS is unmeasured: `NSURLSession` may add `Accept-Language` on its own, which would leave iOS traffic unflagged. Typing the site `app` exempts both platforms.

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

## Navigation Tracking

Automatically track screen views with React Navigation:

```tsx
import { useNavigationTracking } from '@litemetrics/react-native';
import { NavigationContainer } from '@react-navigation/native';

function AppNavigator() {
  const navigationRef = useNavigationTracking();

  return (
    <NavigationContainer ref={navigationRef}>
      {/* Your screens */}
    </NavigationContainer>
  );
}
```

## Hooks

### `useLitemetrics`

Access the tracker instance for custom events and identification:

```tsx
import { useLitemetrics } from '@litemetrics/react-native';

function PurchaseButton({ product }) {
  const tracker = useLitemetrics();

  return (
    <Button
      title="Buy"
      onPress={() => tracker.track('Purchase', { product: product.name })}
    />
  );
}
```

### `useAppStateTracking`

Track app foreground/background transitions:

```tsx
import { useAppStateTracking } from '@litemetrics/react-native';

function App() {
  useAppStateTracking();
  return <YourApp />;
}
```

## License

MIT
