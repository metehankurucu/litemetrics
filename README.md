<p align="center">
  <img src="logo.png" alt="Litemetrics" width="200" />
</p>

<h1 align="center">Litemetrics</h1>

<p align="center">
  <strong>Open-source analytics you can integrate into your product.</strong><br/>
  Give your users a beautiful analytics dashboard in 5 minutes.
</p>

<p align="center">
  <a href="https://demo.litemetrics.dev"><strong>Live Demo</strong></a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#packages">Packages</a> •
  <a href="#deploy">Deploy</a> •
  <a href="#docs">Docs</a> •
  <a href="https://github.com/metehankurucu/litemetrics/issues">Issues</a>
</p>

<p align="center">
  <a href="https://demo.litemetrics.dev"><img src="https://img.shields.io/badge/%E2%96%B6%EF%B8%8F_Live_Demo-demo.litemetrics.dev-00c853?style=for-the-badge&labelColor=1a1a2e" alt="Live Demo" /></a>
</p>

<p align="center">
  <a href="https://railway.com/template/OQI8lX?referralCode=LpQIoM"><img src="https://railway.com/button.svg" alt="Deploy on Railway" /></a>
</p>

<br/>

<p align="center">
  <img src="examples/demo.png" alt="Litemetrics Dashboard" width="100%" style="border-radius: 8px;" />
</p>

<br/>

<p align="center">
  <strong>AI Agent Skill:</strong>&nbsp; <code>npx skills add metehankurucu/litemetrics</code><br/>
  <sub>Gives your AI coding agent (Claude Code, Cursor, Windsurf) full knowledge of Litemetrics integration patterns.</sub>
</p>

<br/>

## Why Litemetrics?

| | |
|---|---|
| **Embed into your product** | Drop a full analytics stack into your app — tracker, server, query API, and a pre-built dashboard UI. Your customers get analytics without you building anything. |
| **Your brand, your colors** | 10 built-in theme presets. CSS custom properties for full control. Dark mode included. Ship analytics that look like they belong in your app. |
| **Multi-tenant ready** | Each customer gets isolated analytics via `site_id`. One database, zero cross-contamination. Built for SaaS from day one. |
| **Lightweight tracker** | ~3 KB gzipped. Auto-tracks pageviews, sessions, scroll depth, button clicks, outbound links — or go fully manual. |
| **ClickHouse, Postgres & MongoDB** | Choose the database that fits. ClickHouse for speed at scale, Postgres for the DB you already run, MongoDB for simplicity. Swap with one env var, full feature parity. |
| **One-click deploy** | Docker Compose, Railway, or a single Docker container. Up and running in under a minute. |

<br/>

## Quick Start

### 1. Add a dashboard to your app

```bash
npm install @litemetrics/ui
```

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

### 2. Add tracking to your site

```html
<script src="https://your-server.com/litemetrics.js"></script>
<script>
  Litemetrics.createTracker({
    siteId: 'your-site-id',
    endpoint: 'https://your-server.com/api/collect'
  });
</script>
```

### 3. Add the server (Express)

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

> For Postgres: `db: { adapter: 'postgres', url: 'postgres://user:pass@localhost:5432/myapp' }`
>
> For MongoDB: `db: { adapter: 'mongodb', url: 'mongodb://localhost:27017/myapp' }`

### 4. Run the mobile app (Expo)

```bash
cd apps/mobile
bun install
bun run start
```

For platform-specific launches:

```bash
bun run ios
bun run android
```

### 5. Query from the terminal (CLI)

```bash
bun add -g @litemetrics/cli
```

```bash
# Configure once
export LITEMETRICS_URL=https://your-server.com
export LITEMETRICS_ADMIN_SECRET=your-secret
export LITEMETRICS_SITE_ID=your-site-id

# Overview of all metrics
litemetrics overview -p 7d --compare

# Top pages
litemetrics stats top_pages -p 30d -l 10

# Time series
litemetrics timeseries visitors -p 30d -g day

# JSON output for AI agents
litemetrics overview -p 7d -f json
```

See [`packages/cli/README.md`](./packages/cli/README.md) for all commands.

<br/>

## Deploy

### Docker Compose (recommended)

```bash
git clone https://github.com/metehankurucu/litemetrics.git
cd litemetrics
ADMIN_SECRET=your-secret docker compose up -d
```

Open `http://localhost:3002` for the dashboard.

### Docker (standalone)

```bash
docker build -t litemetrics .
docker run -p 3002:3002 \
  -e CLICKHOUSE_URL=http://your-clickhouse:8123 \
  -e ADMIN_SECRET=your-secret \
  litemetrics
```

### Railway (one click)

1. Click the **Deploy on Railway** button above
2. Add a database plugin — Postgres, ClickHouse, or MongoDB
3. Set `DB_ADAPTER` and the matching URL (`POSTGRES_URL`, `CLICKHOUSE_URL`, or `MONGODB_URL`) plus `ADMIN_SECRET`
4. Done — dashboard, API, and tracker served from one container

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_ADAPTER` | Database adapter (`clickhouse`, `postgres`, or `mongodb`) | `clickhouse` |
| `CLICKHOUSE_URL` | ClickHouse connection URL | `http://localhost:8123` |
| `POSTGRES_URL` | Postgres connection string | `postgres://postgres:postgres@localhost:5432/litemetrics` |
| `MONGODB_URL` | MongoDB connection string | `mongodb://localhost:27017/litemetrics` |
| `ADMIN_SECRET` | Secret for admin access and site management | _(none)_ |
| `PORT` | Server port | `3002` |
| `GEOIP` | Enable GeoIP lookup | `true` |
| `TRUST_PROXY` | Trust X-Forwarded-For headers | `true` |
| `BOT_FILTER_MODE` | Server-wide bot filter default: `off` / `standard` / `strict` / `shadow` | `standard` |
| `BOT_RATE_WINDOW_MS` | Sliding-window size for the per-IP rate limiter (ms) | `60000` |
| `BOT_RATE_MAX` | Max events per window per IP before rate-limit fires | `60` |

> `DATABASE_URL` and `LITEMETRICS_ADMIN_SECRET` also work as aliases.

<br/>

## Architecture

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│                  │  POST   │                  │  GET    │                  │
│  @litemetrics/   │ /collect│  @litemetrics/   │ /stats  │  @litemetrics/   │
│  tracker         ├────────>│  node            │<────────┤  dashboard       │
│                  │         │  (collector)     │         │                  │
│  ~3KB, browser   │ events  │  ClickHouse /    │ queries │  React UI        │
│                  │         │  Postgres /      │         │                  │
│                  │         │  MongoDB         │         │                  │
└──────────────────┘         └──────────────────┘         └──────────────────┘
     Browser / App                Your Server           ▲     Dashboard
                                                        │
                                                   ┌────┴─────────────┐
                                                   │  @litemetrics/   │
                                                   │  cli             │
                                                   │  Terminal / AI   │
                                                   └──────────────────┘
```

The tracker handles session management, visitor IDs, batching, and SPA detection client-side. The server stores events and runs queries. The CLI provides terminal access to all analytics data — designed for both humans and AI agents. The Docker image bundles everything into a single container.

<br/>

## Packages

| Package | Description |
|---------|-------------|
| [`@litemetrics/ui`](./packages/ui) | Pre-built React dashboard components (10 themes, dark mode, CSS variables) |
| [`@litemetrics/tracker`](./packages/tracker) | Browser tracker (~3 KB gzipped) |
| [`@litemetrics/node`](./packages/node) | Server collector, ClickHouse/Postgres/MongoDB adapters, query API |
| [`@litemetrics/react`](./packages/react) | React provider and hooks |
| [`@litemetrics/react-native`](./packages/react-native) | React Native / Expo provider |
| [`@litemetrics/client`](./packages/client) | Typed client for reading analytics data |
| [`@litemetrics/cli`](./packages/cli) | CLI tool for querying analytics and managing sites |
| [`@litemetrics/core`](./packages/core) | Shared types and constants |

### Apps

| App | Description |
|-----|-------------|
| [`@litemetrics/dashboard`](./apps/dashboard) | Analytics dashboard (React + Vite + Tailwind) |
| [`@litemetrics/server`](./apps/server) | Self-hosted server (serves dashboard + API) |
| [`@litemetrics/mobile`](./apps/mobile) | Native mobile analytics app (Expo Router + React Native) |
| [`@litemetrics/landing`](./apps/landing) | Landing page (React + Vite + Tailwind) |

<br/>

## Metrics

`pageviews` · `visitors` · `sessions` · `events` · `conversions` · `top_pages` · `top_referrers` · `top_countries` · `top_cities` · `top_events` · `top_conversions` · `top_exit_pages` · `top_transitions` · `top_scroll_pages` · `top_button_clicks` · `top_link_targets` · `top_devices` · `top_browsers` · `top_os` · `top_os_versions` · `top_device_models` · `top_app_versions` · `top_utm_sources` · `top_utm_mediums` · `top_utm_campaigns` · `top_utm_terms` · `top_utm_contents` · `top_channels` · `timeseries` · `retention`

<br/>

## Auto Events & Insights

- Auto events are tagged with `event_source=auto` and a subtype (`scroll_depth`, `button_click`, `link_click`, `outbound_click`).
- Manual `track()` events default to `event_source=manual` and `event_subtype=custom`.
- All metrics and time series support segmentation filters (geo, device, UTM, referrer, event metadata).
- The dashboard **Insights** view surfaces exit pages, transitions, scroll-heavy pages, and click hotspots.

<br/>

## Bot Filtering

Litemetrics ships with multi-layer bot filtering enabled by default. Bot traffic is excluded from every query unless you explicitly opt in.

- **Tracker short-circuit** — when `navigator.webdriver === true`, the browser tracker becomes a no-op. Catches Selenium / Puppeteer / Playwright at the source before the event ever leaves the page.
- **Layer 1 (signature)** — server-side match against the maintained [`isbot`](https://github.com/omrilotan/isbot) list of known crawlers / preview bots.
- **Layer 2 (heuristic)** — catches scrubbed or empty user agents (no UA, bare `Mozilla/5.0`, missing platform tokens, etc).
- **Layer 3 (rate limit)** — sliding-window per-IP cap (`BOT_RATE_WINDOW_MS` / `BOT_RATE_MAX`) for traffic that escapes the first two layers.

Modes are configured server-wide via `BOT_FILTER_MODE` and overridable per-site:

| Mode | Behavior |
|------|----------|
| `off` | All filtering disabled |
| `standard` (default) | Layer 1 drops the event; Layers 2 + 3 flag it (kept in DB, hidden from queries) |
| `strict` | Every layer drops the event |
| `shadow` | Every layer flags only — useful for tuning before going live |

Each detection emits a structured audit log line:

```
[bot-filter] dropped layer=signature mode=standard site=site_abc ip=203.0.113.4
```

Pass `?includeBots=true` to `/api/stats`, `/api/events`, or `/api/users` to see flagged traffic. The dashboard exposes the same toggle on the Analytics page, and per-site bot mode lives on the Settings page.

<br/>

## Docs

- [Getting Started](./docs/getting-started.md)
- [Integration Guide](./docs/integration-guide.md) — React, React Native, Next.js, Vue, Python, PHP, Ruby, Go
- [API Reference](./docs/api-reference.md)
- [Dashboard](./docs/dashboard.md)
- [CLI](./packages/cli/README.md)
- [Mobile App](./apps/mobile/README.md)
- [Self-Hosting](./docs/self-hosting.md)
- [Scaling](./docs/scaling.md)

<br/>

## Development

```bash
git clone https://github.com/metehankurucu/litemetrics.git
cd litemetrics
bun install
bun run build
```

<br/>

## License

MIT
