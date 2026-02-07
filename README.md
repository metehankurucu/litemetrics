<p align="center">
  <img src="logo.png" alt="Litemetrics" width="200" />
</p>

<h1 align="center">Litemetrics</h1>

<p align="center">Open-source analytics SDK you can embed in your product. Give your users a beautiful analytics dashboard in 5 minutes.</p>

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/OQI8lX?referralCode=LpQIoM)

## Why Litemetrics?

### Embed in your product

Drop a full analytics dashboard into your React app with `@litemetrics/ui`. Charts, maps, tables — all pre-built. Your customers get analytics without you building anything.

```tsx
import { LitemetricsProvider, AnalyticsDashboard } from '@litemetrics/ui';

function CustomerDashboard({ customerId }) {
  return (
    <LitemetricsProvider baseUrl="/api/stats" siteId={customerId}>
      <AnalyticsDashboard theme="midnight" />
    </LitemetricsProvider>
  );
}
```

### Your brand, your colors

10 built-in theme presets. CSS custom properties for full control. Dark mode included. Ship analytics that look like they belong in your app — not some third-party widget.

### Multi-tenant ready

Each customer gets their own isolated analytics via `site_id`. One database, zero cross-contamination. Built for SaaS from day one.

## Quick Start

### Embed a dashboard (recommended)

```bash
npm install @litemetrics/ui
```

```tsx
import { LitemetricsProvider, AnalyticsDashboard } from '@litemetrics/ui';

<LitemetricsProvider baseUrl="https://your-server.com/api/stats" siteId="customer-123">
  <AnalyticsDashboard />
</LitemetricsProvider>
```

### Add tracking to your site

```html
<script src="https://your-server.com/litemetrics.js"></script>
<script>
  Litemetrics.createTracker({
    siteId: 'your-site-id',
    endpoint: 'https://your-server.com/api/collect'
  });
</script>
```

### Add to your Express server

```bash
npm install @litemetrics/node
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

## Packages

| Package | Description |
|---------|-------------|
| [`@litemetrics/ui`](./packages/ui) | Embeddable React dashboard components (10 themes, dark mode, CSS variables) |
| [`@litemetrics/core`](./packages/core) | Shared types and constants |
| [`@litemetrics/tracker`](./packages/tracker) | Browser tracker (~3KB gzipped) |
| [`@litemetrics/node`](./packages/node) | Server collector, ClickHouse/MongoDB adapters, query API |
| [`@litemetrics/react`](./packages/react) | React provider and hooks |
| [`@litemetrics/react-native`](./packages/react-native) | React Native / Expo provider |
| [`@litemetrics/client`](./packages/client) | Typed client for reading analytics data |
| [`@litemetrics/dashboard`](./apps/dashboard) | Analytics dashboard (React + Vite + Tailwind) |
| [`@litemetrics/server`](./apps/server) | Self-hosted server (serves dashboard + API) |

## Agent Skill

Install the Litemetrics skill for AI coding agents (Claude Code, Cursor, Windsurf, etc.):

```bash
npx skills add metehankurucu/litemetrics
```

This gives your AI agent full knowledge of Litemetrics integration patterns for Express, React, React Native, Next.js, Vue, and more.

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
