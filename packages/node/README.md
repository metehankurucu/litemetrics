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

### MongoDB

```ts
const collector = await createCollector({
  db: { adapter: 'mongodb', url: 'mongodb://localhost:27017/litemetrics' },
});
```

## Features

- **Event Collection** - Receives batched events from the browser tracker
- **Bot Filtering** - Automatically drops events from known bots and crawlers
- **GeoIP Enrichment** - Resolves country/city from IP using MaxMind GeoLite2
- **User-Agent Parsing** - Extracts browser, OS, and device type
- **Hostname Filtering** - Only count events from allowed hostnames per site
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
