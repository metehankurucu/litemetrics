# Browser Tracker Integration

## Script Tag (no build step)

```html
<script src="https://your-server.com/tracker.js"></script>
<script>
  Litemetrics.createTracker({
    siteId: 'your-site-id',
    endpoint: 'https://your-server.com/api/collect',
  });
</script>
```

## NPM / Bun

```bash
npm install @litemetrics/tracker
```

```ts
import { createTracker } from '@litemetrics/tracker';

const tracker = createTracker({
  siteId: 'your-site-id',
  endpoint: 'https://your-server.com/api/collect',
});

// Manual event tracking
tracker.track('signup', { plan: 'pro' });
tracker.identify('user-123', { name: 'John', email: 'john@example.com' });
```

## Full Config Options

```ts
createTracker({
  siteId: 'your-site-id',        // Required
  endpoint: '/api/collect',       // Required

  // Auto-tracking (all default: true)
  autoTrack: true,                // Pageviews on load
  autoSpa: true,                  // SPA route changes (History API)
  autoOutbound: true,             // Outbound link clicks
  autoFileDownloads: true,        // File downloads (.pdf, .zip, etc.)
  autoScrollDepth: true,          // Scroll milestones (25%, 50%, 75%, 90%)
  autoRageClicks: true,           // 3+ rapid clicks in same area

  // Batching
  batchSize: 10,                  // Events per batch (default: 10)
  flushInterval: 5000,            // Flush interval in ms (default: 5000)

  // Privacy
  respectDnt: true,               // Respect Do Not Track (default: true)
  debug: false,                   // Console logging (default: false)
});
```

## Auto-Tracked Events

| Event | Trigger | Data |
|-------|---------|------|
| `pageview` | Page load + SPA navigation | URL, referrer, title |
| `outbound_click` | Click on external link | Target URL |
| `file_download` | Click on .pdf/.zip/.doc/etc. | File URL, extension |
| `scroll_depth` | Scroll past 25/50/75/90% | Depth percentage |
| `rage_click` | 3+ clicks in 500ms within 30px | Element selector |

## Data Attribute Tracking

Track custom events via HTML attributes without JavaScript:

```html
<button data-litemetrics-event="cta_click">Get Started</button>
<a href="/pricing" data-litemetrics-event="pricing_viewed">Pricing</a>
```

## Manual API

```ts
const tracker = createTracker({ ... });

// Track custom event
tracker.track('purchase', { amount: 99, currency: 'USD' });

// Identify user
tracker.identify('user-123', { name: 'John', plan: 'pro' });

// Manual pageview (if autoTrack: false)
tracker.trackPageview();

// Flush pending events immediately
tracker.flush();

// Destroy tracker (cleanup)
tracker.destroy();
```

## Next.js Integration

```tsx
// app/layout.tsx
import Script from 'next/script';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Script
          src="https://your-server.com/tracker.js"
          strategy="afterInteractive"
        />
        <Script id="litemetrics-init" strategy="afterInteractive">
          {`Litemetrics.createTracker({
            siteId: '${process.env.NEXT_PUBLIC_LITEMETRICS_SITE_ID}',
            endpoint: '${process.env.NEXT_PUBLIC_LITEMETRICS_URL}/api/collect',
          });`}
        </Script>
      </body>
    </html>
  );
}
```

## Vue / Nuxt Integration

```ts
// plugins/litemetrics.client.ts (Nuxt) or main.ts (Vue)
import { createTracker } from '@litemetrics/tracker';

const tracker = createTracker({
  siteId: import.meta.env.VITE_LITEMETRICS_SITE_ID,
  endpoint: import.meta.env.VITE_LITEMETRICS_URL + '/api/collect',
});

// For Vue plugin pattern
export default defineNuxtPlugin(() => {
  return { provide: { tracker } };
});
```

## Svelte / SvelteKit Integration

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { onMount } from 'svelte';
  import { createTracker } from '@litemetrics/tracker';

  onMount(() => {
    createTracker({
      siteId: import.meta.env.VITE_LITEMETRICS_SITE_ID,
      endpoint: import.meta.env.VITE_LITEMETRICS_URL + '/api/collect',
    });
  });
</script>

<slot />
```
