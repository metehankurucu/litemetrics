# @litemetrics/react

React bindings for Litemetrics analytics. Provider component and hooks for tracking pageviews and custom events.

## Installation

```bash
npm install @litemetrics/react
```

## Quick Start

```tsx
import { LitemetricsProvider } from '@litemetrics/react';

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

## Hooks

### `useTrackEvent`

Track custom events from any component:

```tsx
import { useTrackEvent } from '@litemetrics/react';

function SignupButton() {
  const track = useTrackEvent();

  return (
    <button onClick={() => track('Signup', { plan: 'pro' })}>
      Sign Up
    </button>
  );
}
```

### `usePageView`

Manually trigger a pageview:

```tsx
import { usePageView } from '@litemetrics/react';

function Page() {
  usePageView(); // Tracks on mount
  return <div>...</div>;
}
```

### `useLitemetrics`

Access the full tracker instance:

```tsx
import { useLitemetrics } from '@litemetrics/react';

function UserProfile({ user }) {
  const tracker = useLitemetrics();

  useEffect(() => {
    tracker.identify(user.id, { name: user.name });
  }, [user]);

  return <div>...</div>;
}
```

## Next.js (App Router)

```tsx
// app/providers.tsx
'use client';
import { LitemetricsProvider } from '@litemetrics/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LitemetricsProvider
      siteId="your-site-id"
      endpoint="https://your-server.com/api/collect"
    >
      {children}
    </LitemetricsProvider>
  );
}

// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({ children }) {
  return (
    <html><body>
      <Providers>{children}</Providers>
    </body></html>
  );
}
```

## License

MIT
