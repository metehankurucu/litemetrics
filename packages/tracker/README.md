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
- **Data Attributes** - Clicks on `data-litemetrics-event="EventName"` elements.
  A click on such an element, or anywhere inside one, is recorded **only** as the
  declared event: the auto link/button click events below are suppressed for it.
  An empty label (`data-litemetrics-event=""`) counts as unlabelled and keeps auto capture.
- **Link Clicks** - Internal link clicks (path + link target path + text + selector)
- **Outbound Links** - Clicks on external links (destination host + path + query, text + selector)
- **File Downloads** - Clicks on links to `.pdf`, `.zip`, `.doc`, `.csv`, etc. (text + selector)
- **Button Clicks** - Button clicks (text + selector)
- **Scroll Depth** - Milestones at 25%, 50%, 75%, 90%
- **Rage Clicks** - 3+ rapid clicks in the same area

Auto events are tagged with `eventSource=auto` and an `eventSubtype` - one of `link_click`, `outbound_click`, `file_download`, `button_click`, `scroll_depth`, `rage_click`. This makes them easy to filter in the dashboard and API.
Manual `track()` events default to `eventSource=manual` and `eventSubtype=custom`; data-attribute clicks are also `eventSource=manual`, with `eventSubtype=attribute`. Older events collected before this change may have `eventSource` set to `null`.

## Configuration

```ts
createTracker({
  siteId: 'your-site-id',        // Required
  endpoint: '/api/collect',       // Required
  autoTrack: true,                // Auto-track pageviews (default: true)
  autoSpa: true,                  // Auto-track SPA navigation (default: true)
  autoOutbound: true,             // Track outbound link clicks (default: true)
  autoLinkClicks: true,           // Track internal link clicks (default: true)
  autoFileDownloads: true,        // Track file downloads (default: true)
  autoButtonClicks: true,         // Track button clicks (default: true)
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

## Bot Short-Circuit

When `navigator.webdriver === true`, `createTracker` returns a no-op tracker —
`track`, `page`, `identify`, `opt_in`, and `opt_out` all become safe no-ops and
no network requests are made. This catches Selenium, Puppeteer, and Playwright
at the source so synthetic events never reach your collector. Server-side bot
filtering (`@litemetrics/node`) still handles bots that mask `webdriver`.

## Privacy

- Respects `Do Not Track` browser setting
- No cookies set - uses `localStorage` for session/visitor IDs. The one cookie *read* (never set) is Meta's `_fbp`, and only for visitors who landed with an ad click ID (`gclid`/`gbraid`/`wbraid`/`fbclid`) — a visitor who never clicked an ad sends no cookie value
- Ad click IDs are kept for 90 days (conversion windows) and dropped by `reset()`
- `opt_out()` / `opt_in()` methods for user consent
- All data sent to your own server (self-hosted)

## License

MIT
