<p align="center">
  <img src="logo.png" alt="Litemetrics" width="200" />
</p>

<h1 align="center">Litemetrics</h1>

<p align="center">Open-source, self-hosted analytics SDK for Node.js. Runs inside your existing server with ClickHouse or MongoDB.</p>

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/litemetrics?referralCode=litemetrics)

## What it does

Collects pageviews, custom events, and user identities from websites and apps. Stores everything in ClickHouse (default) or MongoDB. Provides a query API and a dashboard to view the data.

## Who it's for

- Developers who want analytics without third-party services
- SaaS platforms that need per-customer analytics (multi-tenant)
- Anyone who wants to keep analytics data in their own database

## Deploy

### Docker Compose (recommended)

```bash
git clone https://github.com/metehankurucu/litemetrics.git
cd litemetrics
ADMIN_SECRET=your-secret docker compose up -d
```

This starts ClickHouse and Litemetrics together. Open `http://localhost:3002` for the dashboard.

### Docker (standalone)

```bash
docker build -t litemetrics .
docker run -p 3002:3002 \
  -e CLICKHOUSE_URL=http://your-clickhouse:8123 \
  -e ADMIN_SECRET=your-secret \
  litemetrics
```

### Railway (one click)

1. Click the "Deploy on Railway" button above
2. Add a ClickHouse plugin (or MongoDB)
3. Set `CLICKHOUSE_URL` (or `MONGODB_URL`) and `ADMIN_SECRET` environment variables
4. Done -- dashboard, API, and tracker are all served from one container

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_ADAPTER` | Database adapter (`clickhouse` or `mongodb`) | `clickhouse` |
| `CLICKHOUSE_URL` | ClickHouse connection URL | `http://localhost:8123` |
| `MONGODB_URL` | MongoDB connection string (when using mongodb adapter) | `mongodb://localhost:27017/litemetrics` |
| `ADMIN_SECRET` | Secret for admin access and site management | _(none)_ |
| `PORT` | Server port | `3002` |
| `GEOIP` | Enable GeoIP lookup | `true` |
| `TRUST_PROXY` | Trust X-Forwarded-For headers | `true` |

`DATABASE_URL` and `LITEMETRICS_ADMIN_SECRET` also work as aliases.

## Architecture

```
Browser / App                    Your Server                    Dashboard
┌─────────────┐    POST /collect     ┌──────────────┐    GET /stats     ┌───────────┐
│ @litemetrics/     │ ──────────────────> │ @litemetrics/node │ <──────────────── │ @litemetrics/  │
│  tracker     │   batched events    │  (collector)  │   query results  │  dashboard│
└─────────────┘                      │  ClickHouse   │                  └───────────┘
                                     └──────────────┘
```

The tracker handles session management, visitor IDs, batching, and SPA detection client-side. The server stores events and runs queries. The Docker image bundles everything into a single container.

## Quick Start (embed in your own server)

If you prefer to add Litemetrics to your existing Express app instead of running the standalone server:

```bash
bun add @litemetrics/node
```

```ts
import express from 'express';
import { createCollector } from '@litemetrics/node';

const app = express();
app.use(express.json());

const collector = await createCollector({
  db: { url: 'http://localhost:8123' },
});

app.all('/api/collect', (req, res) => collector.handler()(req, res));
app.all('/api/stats', (req, res) => collector.queryHandler()(req, res));

app.listen(3002);
```

For MongoDB instead: `db: { adapter: 'mongodb', url: 'mongodb://localhost:27017/myapp' }`

## Tracker

```html
<script src="https://your-server.com/litemetrics.js"></script>
<script>
  Litemetrics.createTracker({
    siteId: 'your-site-id',
    endpoint: 'https://your-server.com/api/collect'
  });
</script>
```

## Packages

| Package | Description |
|---------|-------------|
| [`@litemetrics/core`](./packages/core) | Shared types and constants |
| [`@litemetrics/tracker`](./packages/tracker) | Browser tracker (~3KB gzipped) |
| [`@litemetrics/node`](./packages/node) | Server collector, ClickHouse/MongoDB adapters, query API |
| [`@litemetrics/react`](./packages/react) | React provider and hooks |
| [`@litemetrics/react-native`](./packages/react-native) | React Native / Expo provider |
| [`@litemetrics/client`](./packages/client) | Typed client for reading analytics data |
| [`@litemetrics/dashboard`](./apps/dashboard) | Analytics dashboard (React + Vite + Tailwind) |
| [`@litemetrics/server`](./apps/server) | Self-hosted server (serves dashboard + API) |

## Metrics

`pageviews` `visitors` `sessions` `events` `top_pages` `top_referrers` `top_countries` `top_cities` `top_events` `top_devices` `top_browsers` `top_os` `timeseries` `retention`

## Docs

- [Getting Started](./docs/getting-started.md)
- [Integration Guide](./docs/integration-guide.md) -- React, React Native, Next.js, Vue, Python, PHP, Ruby, Go
- [API Reference](./docs/api-reference.md)
- [Dashboard](./docs/dashboard.md)
- [Self-Hosting](./docs/self-hosting.md)
- [Scaling](./docs/scaling.md)

## Development

```bash
git clone https://github.com/metehankurucu/litemetrics.git
cd litemetrics
bun install
bun run build
```

## License

MIT
