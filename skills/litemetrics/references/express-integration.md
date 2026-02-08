# Express / Node.js Backend Integration

## Install

```bash
npm install @litemetrics/node
# or
bun add @litemetrics/node
```

## Minimal Setup

```ts
import express from 'express';
import { createCollector } from '@litemetrics/node';

const app = express();
app.use(express.json());

const collector = await createCollector({
  db: { url: 'http://localhost:8123' }, // ClickHouse default
});

app.all('/api/collect', (req, res) => collector.handler()(req, res));
app.all('/api/stats', (req, res) => collector.queryHandler()(req, res));

app.listen(3002);
```

## Full Setup (all endpoints)

```ts
import express from 'express';
import cors from 'cors';
import { createCollector } from '@litemetrics/node';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const collector = await createCollector({
  db: {
    adapter: 'clickhouse',  // or 'mongodb'
    url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  },
  adminSecret: process.env.ADMIN_SECRET,
  geoip: true,
  trustProxy: true,
});

// Event collection
app.all('/api/collect', async (req, res) => {
  await collector.handler()(req, res);
});

// Query analytics
app.all('/api/stats', async (req, res) => {
  await collector.queryHandler()(req, res);
});

// List raw events
app.all('/api/events', async (req, res) => {
  await collector.eventsHandler()(req, res);
});

// User profiles
app.all('/api/users', async (req, res) => {
  await collector.usersHandler()(req, res);
});
app.all('/api/users/*', async (req, res) => {
  await collector.usersHandler()(req, res);
});

// Site management (CRUD)
app.all('/api/sites', async (req, res) => {
  await collector.sitesHandler()(req, res);
});
app.all('/api/sites/*', async (req, res) => {
  await collector.sitesHandler()(req, res);
});

app.listen(3002);
```

## MongoDB Instead of ClickHouse

```ts
const collector = await createCollector({
  db: {
    adapter: 'mongodb',
    url: 'mongodb://localhost:27017/litemetrics',
  },
});
```

## CORS Headers

When the tracker sends from a different origin, add these headers:
- `Access-Control-Allow-Origin: *` (or specific origins)
- `Access-Control-Allow-Headers: Content-Type, X-Litemetrics-Secret, X-Litemetrics-Admin-Secret`
- `Access-Control-Allow-Credentials: true`

The `cors` package with `origin: true` handles this.

## Collector Config Options

```ts
interface CollectorConfig {
  db: {
    adapter?: 'clickhouse' | 'mongodb';  // default: 'clickhouse'
    url: string;
  };
  adminSecret?: string;    // Required for site management endpoints
  geoip?: boolean;         // Enable GeoIP country lookup (default: true)
  trustProxy?: boolean;    // Trust X-Forwarded-For (default: true)
}
```

## API Endpoints Reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/collect` | POST | Site secret (optional) | Receive tracker events |
| `/api/stats` | GET | Site secret | Query analytics metrics |
| `/api/events` | GET | Site secret | List raw events |
| `/api/users` | GET | Site secret | List user profiles |
| `/api/users/:id` | GET | Site secret | User detail |
| `/api/sites` | GET/POST | Admin secret | List/create sites |
| `/api/sites/:id` | GET/PUT/DELETE | Admin secret | Site CRUD |

### Query Parameters for /api/stats

```
GET /api/stats?site_id=xxx&metric=pageviews&period=7d
GET /api/stats?site_id=xxx&metric=top_pages&period=30d&limit=10
GET /api/stats?site_id=xxx&metric=timeseries&period=7d&granularity=day
```

Available metrics: `pageviews`, `visitors`, `sessions`, `events`, `conversions`, `top_pages`, `top_referrers`, `top_countries`, `top_cities`, `top_events`, `top_conversions`, `top_devices`, `top_browsers`, `top_os`, `timeseries`, `retention`

### Event List Filters (/api/events)

`eventName` = single name, `eventNames` = comma-separated list.

```
GET /api/events?siteId=site_abc&type=event&eventNames=Signup,Purchase&period=7d
```

### Conversion Events (Site Settings)

Conversions are custom events whose names match `conversionEvents` in the site record.

```
PUT /api/sites/:id
{
  "conversionEvents": ["Signup", "Purchase"]
}
```

Periods: `1h`, `24h`, `7d`, `30d`, `90d`, or custom date range with `start` and `end` params.
