# React Integration

## Install

```bash
npm install @litemetrics/react
```

Peer dependency: `react >= 18`

## Provider Setup

Wrap your app with `LitemetricsProvider`:

```tsx
// main.tsx or App.tsx
import { LitemetricsProvider } from '@litemetrics/react';

createRoot(document.getElementById('root')!).render(
  <LitemetricsProvider
    siteId="your-site-id"
    endpoint="https://your-server.com/api/collect"
    autoPageView
    debug={false}
  >
    <App />
  </LitemetricsProvider>
);
```

## Hooks

### usePageView — Track page views

```tsx
import { usePageView } from '@litemetrics/react';

function HomePage() {
  usePageView('/home');
  return <div>Home</div>;
}
```

### useLitemetrics — Full tracker access

```tsx
import { useLitemetrics } from '@litemetrics/react';

function SignupButton() {
  const { track, identify } = useLitemetrics();

  const handleSignup = () => {
    track('signup', { plan: 'pro' });
    identify('user-123', { name: 'John' });
  };

  return <button onClick={handleSignup}>Sign Up</button>;
}
```

### useTrackEvent — Auto-track on mount

```tsx
import { useTrackEvent } from '@litemetrics/react';

function PricingPage() {
  useTrackEvent('pricing_viewed', { source: 'navbar' });
  return <div>Pricing</div>;
}
```

## Provider Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `siteId` | `string` | required | Site ID from Litemetrics |
| `endpoint` | `string` | required | Collection endpoint URL |
| `autoPageView` | `boolean` | `true` | Auto-track pageviews |
| `debug` | `boolean` | `false` | Console logging |
| `respectDnt` | `boolean` | `true` | Respect Do Not Track |

## React Router Integration

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LitemetricsProvider } from '@litemetrics/react';

function App() {
  return (
    <BrowserRouter>
      <LitemetricsProvider
        siteId="your-site-id"
        endpoint="/api/collect"
        autoPageView
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </LitemetricsProvider>
    </BrowserRouter>
  );
}
```

The tracker auto-detects SPA navigation via History API. No extra config needed.
