# @litemetrics/tracker

Lightweight browser analytics tracker for Litemetrics. **~3.5KB gzipped.**

## Installation

```bash
npm install @litemetrics/tracker
```

Or use the script tag (no build step needed):

```html
<script src="https://your-server.com/litemetrics.js"></script>
<script>
  Litemetrics.createTracker({
    siteId: 'your-site-id',
    endpoint: 'https://your-server.com/api/collect',
  });
</script>
```

## Usage

```ts
import { createTracker } from '@litemetrics/tracker';

const tracker = createTracker({
  siteId: 'your-site-id',
  endpoint: 'https://your-server.com/api/collect',
});

// Track custom events
tracker.track('Signup', { plan: 'pro' });

// Identify users
tracker.identify('user-123', { name: 'John', email: 'john@example.com' });

// Manual page tracking
tracker.page();
```

## Auto-Tracking

When `autoTrack` is enabled (default), the tracker automatically captures:

- **Pageviews** - Initial page load
- **SPA Navigation** - Route changes via History API
- **Data Attributes** - Clicks on `data-litemetrics-event="EventName"` elements
- **Outbound Links** - Clicks on external links
- **File Downloads** - Clicks on links to `.pdf`, `.zip`, `.doc`, `.csv`, etc.
- **Scroll Depth** - Milestones at 25%, 50%, 75%, 90%
- **Rage Clicks** - 3+ rapid clicks in the same area

## Configuration

```ts
createTracker({
  siteId: 'your-site-id',        // Required
  endpoint: '/api/collect',       // Required
  autoTrack: true,                // Auto-track pageviews (default: true)
  autoSpa: true,                  // Auto-track SPA navigation (default: true)
  autoOutbound: true,             // Track outbound link clicks (default: true)
  autoFileDownloads: true,        // Track file downloads (default: true)
  autoScrollDepth: true,          // Track scroll depth milestones (default: true)
  autoRageClicks: true,           // Detect rage clicks (default: true)
  batchSize: 10,                  // Events per batch (default: 10)
  flushInterval: 5000,            // Flush interval in ms (default: 5000)
  respectDnt: true,               // Respect Do Not Track (default: true)
  debug: false,                   // Console logging (default: false)
});
```

## Data Attribute Tracking

Track events declaratively with HTML attributes:

```html
<button
  data-litemetrics-event="Add to Cart"
  data-litemetrics-event-product="T-Shirt"
  data-litemetrics-event-price="29.99"
>
  Add to Cart
</button>
```

## Privacy

- Respects `Do Not Track` browser setting
- No cookies - uses `localStorage` for session/visitor IDs
- `opt_out()` / `opt_in()` methods for user consent
- All data sent to your own server (self-hosted)

## License

MIT
