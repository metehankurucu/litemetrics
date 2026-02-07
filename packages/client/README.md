# @litemetrics/client

Client SDK for querying Litemetrics analytics data. Fetch stats, time series, events, users, and manage sites from your frontend or backend.

## Installation

```bash
npm install @litemetrics/client
```

## Quick Start

```ts
import { createClient } from '@litemetrics/client';

const client = createClient({
  baseUrl: 'https://your-server.com',
  siteId: 'your-site-id',
  secretKey: 'your-secret-key',
});
```

## Querying Stats

```ts
// Overview metrics
const overview = await client.getOverview(
  ['pageviews', 'visitors', 'sessions'],
  { period: '7d', compare: true }
);

// Top pages
const pages = await client.getStats('top_pages', { period: '30d', limit: 10 });

// Top referrers
const referrers = await client.getStats('top_referrers', { period: '7d' });

// Country breakdown
const countries = await client.getTopCountries({ period: '30d', limit: 50 });
```

## Time Series

```ts
const timeseries = await client.getTimeSeries({
  metric: 'pageviews',
  period: '30d',
  granularity: 'day',
});

// Returns: { data: [{ date: '2025-01-01', value: 142 }, ...] }
```

## Events & Users

```ts
// List events
const events = await client.getEventsList({
  type: 'pageview',
  period: '24h',
  limit: 50,
});

// List users
const users = await client.getUsersList({ limit: 20 });

// User detail
const user = await client.getUserDetail('visitor-id');
```

## Retention

```ts
const retention = await client.getRetention({ period: '90d', weeks: 8 });
// Returns weekly cohort retention data
```

## Site Management

```ts
import { createSitesClient } from '@litemetrics/client';

const sites = createSitesClient({
  baseUrl: 'https://your-server.com',
  adminSecret: 'your-admin-secret',
});

// CRUD
const { site } = await sites.createSite({ name: 'My App', domain: 'myapp.com' });
const { sites: allSites } = await sites.listSites();
await sites.updateSite(site.siteId, { allowedOrigins: ['myapp.com'] });
await sites.deleteSite(site.siteId);
await sites.regenerateSecret(site.siteId);
```

## Available Metrics

`pageviews` | `visitors` | `sessions` | `events` | `top_pages` | `top_referrers` | `top_countries` | `top_cities` | `top_events` | `top_browsers` | `top_os` | `top_devices`

## License

MIT
