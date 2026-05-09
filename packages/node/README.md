# @litemetrics/node

Self-hosted analytics server for Litemetrics. Includes event collection, query API, site management, GeoIP enrichment, and bot filtering.

## Installation

```bash
npm install @litemetrics/node
```

## Quick Start

```ts
import express from 'express';
import { createCollector } from '@litemetrics/node';

const app = express();
app.use(express.json());

const collector = await createCollector({
  db: { url: 'http://localhost:8123' }, // ClickHouse (default)
  adminSecret: 'your-admin-secret',
  geoip: true,
  cors: { origins: [] }, // Allow all origins
});

// Event collection endpoint (receives tracker data)
app.post('/api/collect', collector.handler());

// Query API (stats, time series, retention)
app.get('/api/stats', collector.queryHandler());

// Event & user listing
app.all('/api/events', collector.eventsHandler());
app.all('/api/users/*', collector.usersHandler());

// Site management (CRUD)
app.all('/api/sites/*', collector.sitesHandler());

// Serve tracker script
app.use(express.static('node_modules/@litemetrics/tracker/dist'));

app.listen(3000);
```

## Database Adapters

### ClickHouse (Default)

```ts
const collector = await createCollector({
  db: { url: 'http://localhost:8123' },
});
```

Uses `MergeTree` for events and `ReplacingMergeTree` for sites. Tables are auto-created on init.

### Postgres

```ts
const collector = await createCollector({
  db: { adapter: 'postgres', url: 'postgres://user:pass@localhost:5432/litemetrics' },
});
```

Full feature parity with the ClickHouse adapter — every metric, time series, top-N query, and retention cohort produces identical results across both backends. Uses native `jsonb` for properties/traits, indexed `(site_id, timestamp)` for fast range scans, and a soft-delete column on sites. Tables are auto-created on init. Recommended when you already run Postgres and want one less moving piece.

### MongoDB

```ts
const collector = await createCollector({
  db: { adapter: 'mongodb', url: 'mongodb://localhost:27017/litemetrics' },
});
```

## Timestamp Sanitization

The collector validates client-supplied event timestamps against server time. Events with timestamps outside the allowed window are dropped by default, preventing data corruption from clients with incorrect system clocks and timestamp-spoofing analytics poisoning.

Defaults: 5 min future tolerance, 24 h past tolerance, `mode: 'drop'`.

```ts
const collector = await createCollector({
  db: { url: 'http://localhost:8123' },
  timestampSanity: {
    // pastMs: 7 * 24 * 60 * 60 * 1000, // widen for long offline queues
    // mode: 'clamp',                    // replace with server-now instead of dropping
    onOutOfWindow: ({ reason, offsetMs, event }) => {
      metrics.increment('litemetrics.ts_out_of_window', { reason });
    },
  },
});
```

**Modes:**
- `'drop'` (default) — out-of-window and invalid (`NaN`, missing, non-number) events are silently discarded.
- `'clamp'` — replace the timestamp with server-now instead of dropping. Preserves the event body.
- `'off'` — pass valid client timestamps through unchanged. Invalid values (`NaN`, missing, non-number) are still replaced with server-now to avoid breaking downstream storage.

If your tracker uses an offline queue that may replay events after long delays, widen `pastMs` accordingly (e.g., `7 * 24 * 60 * 60 * 1000` for a 7-day queue).

The optional `onOutOfWindow(info)` callback fires whenever the sanitizer rejects a value (drop or clamp). Use it to wire poisoning signals into your metrics/alerting. `info.reason` is `'future' | 'past' | 'invalid'`; `info.offsetMs` is how far past the boundary the value was (`0` for invalid types). Callback errors are swallowed.

## Bot Filtering

Multi-layer filtering runs on every collected event. Defaults are conservative
(legitimate traffic is never dropped on a false-positive heuristic) and tunable
per-site via the `botFilterMode` site field.

- **Layer 1 (signature)** — UA matched against the [`isbot`](https://github.com/omrilotan/isbot) list.
- **Layer 2 (heuristic)** — scrubbed / empty UAs (no UA, bare `Mozilla/5.0`, missing platform tokens).
- **Layer 3 (rate limit)** — sliding-window per-IP cap.

Modes: `off`, `standard` (default — Layer 1 drops, Layers 2 & 3 flag), `strict`
(every layer drops), `shadow` (every layer flags only). Pass per-collector via
`botFilter`:

```ts
const collector = await createCollector({
  db: { url: 'http://localhost:8123' },
  botFilter: {
    defaultMode: 'standard',     // server-wide default (off | standard | strict | shadow)
    rateLimitWindowMs: 60_000,   // sliding window for Layer 3
    rateLimitMaxEvents: 60,      // max events / window / IP
    onBotDetected: (info) => {
      // info: { siteId, ip, userAgent, layer, action, mode }
      console.log(`[bot-filter] ${info.action} layer=${info.layer} mode=${info.mode} site=${info.siteId} ip=${info.ip}`);
    },
  },
});
```

Server wrapper env vars (`apps/server`):

- `BOT_FILTER_MODE` (default `standard`): one of `off` / `standard` / `strict` / `shadow`. Controls server-wide bot filtering for sites that don't override per-site.
- `BOT_RATE_WINDOW_MS` (default `60000`): sliding-window size for the per-IP rate limiter (ms).
- `BOT_RATE_MAX` (default `60`): max events per window per IP before the rate-limit layer fires.

Read endpoints (`/api/stats`, `/api/events`, `/api/users`) exclude flagged
events by default. Pass `?includeBots=true` to include them.

## GDPR / Right to erasure

```ts
const { deleted } = await db.deleteUserEvents('site_abc', 'user_123');
// or via HTTP:
//   DELETE /api/users/:identifier/events?siteId=site_abc
//   Headers: X-Litemetrics-Admin-Secret OR X-Litemetrics-Secret (matching site)
//   Returns: { ok: true, deleted: <number> }
```

Resolves both `userId` and `visitorId` through the identity map; idempotent.

## Features

- **Event Collection** - Receives batched events from the browser tracker
- **Bot Filtering** - Multi-layer (signature + heuristic + rate limit), per-site mode
- **GeoIP Enrichment** - Resolves country/city from IP using MaxMind GeoLite2
- **User-Agent Parsing** - Extracts browser, OS, and device type
- **Hostname Filtering** - Only count events from allowed hostnames per site (matched against request Origin/Referer)
- **Query API** - Built-in metrics for pages, events, conversions, and behavioral insights
- **Segmentation Filters** - Filter any metric/time series by geo, device, UTM, referrer, or event metadata
- **Time Series** - Hourly/daily/weekly/monthly breakdowns
- **Retention Analysis** - Weekly cohort retention
- **Site Management** - Multi-tenant CRUD with secret key auth
- **Server-Side Tracking** - Track events and identify users from your backend

## Server-Side Tracking

```ts
// Track events from your backend
await collector.track('site-id', 'Purchase', { amount: 99 }, { userId: 'user-123' });

// Identify users
await collector.identify('site-id', 'user-123', { plan: 'pro' });
```

## Identity Merging

Litemetrics automatically links anonymous visitors to identified users. After a
user is identified, subsequent events are merged across all linked visitor IDs.
`GET /api/users/:identifier` accepts either a `visitorId` or a `userId` and
returns a merged profile when available.

### Backfill (one-time)

If you already have identify events, run the backfill script once to populate
the identity map:

```bash
bun packages/node/src/backfill-identity.ts --adapter clickhouse --url http://localhost:8123
```

## Metrics

| Metric | Description |
|--------|-------------|
| `pageviews` | Total page views |
| `visitors` | Unique visitors |
| `sessions` | Unique sessions |
| `events` | Custom events count |
| `conversions` | Conversion events count |
| `top_pages` | Most visited pages |
| `top_referrers` | Top traffic sources |
| `top_countries` | Visitors by country |
| `top_cities` | Visitors by city |
| `top_events` | Most common custom events |
| `top_conversions` | Most common conversion events |
| `top_exit_pages` | Last page in session |
| `top_transitions` | Page-to-page transitions |
| `top_scroll_pages` | Pages with most scroll depth events |
| `top_button_clicks` | Most clicked buttons (auto events) |
| `top_link_targets` | Most clicked link targets |
| `top_browsers` | Browser breakdown |
| `top_os` | OS breakdown |
| `top_devices` | Device type breakdown |

## License

MIT
