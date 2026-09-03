---
name: litemetrics
description: Integrate Litemetrics analytics into projects. Use when the user wants to add analytics, tracking, pageview collection, event tracking, or an analytics dashboard to their website, web app, React app, React Native app, Next.js app, Vue app, Svelte app, or Node.js/Express server. Also use when the user mentions "litemetrics", "add analytics", "track pageviews", "track events", "analytics dashboard", "embed analytics", "self-hosted analytics", or wants to set up a Litemetrics server with ClickHouse or MongoDB.
---

# Litemetrics Integration

Litemetrics is an open-source, self-hosted analytics SDK. Integrate tracking into any frontend and query analytics from any backend.

## Integration Decision Tree

1. **What needs tracking?**
   - Website (any framework) → Script tag or NPM tracker
   - React app → `@litemetrics/react` provider + hooks
   - React Native / Expo → `@litemetrics/react-native` provider
   - Next.js → Script tag in layout OR React provider

2. **Where does data go?**
   - Use Litemetrics Cloud/self-hosted server → Just add tracker
   - Embed server in existing Express app → `@litemetrics/node`
   - Run standalone server → Docker or `@litemetrics/server`

3. **Need a dashboard?**
   - Embed in React app → `@litemetrics/ui` (themeable components)
   - Use standalone dashboard → Built into `@litemetrics/server`
   - Custom queries → `@litemetrics/client`

## Packages

| Package | Purpose | Install |
|---------|---------|---------|
| `@litemetrics/tracker` | Browser tracking (pageviews, events, sessions) | `npm i @litemetrics/tracker` |
| `@litemetrics/node` | Server-side collector + query API (Express) | `npm i @litemetrics/node` |
| `@litemetrics/react` | React provider + hooks | `npm i @litemetrics/react` |
| `@litemetrics/react-native` | React Native provider + navigation tracking | `npm i @litemetrics/react-native` |
| `@litemetrics/client` | Read analytics data (typed HTTP client) | `npm i @litemetrics/client` |
| `@litemetrics/ui` | Themeable React dashboard components | `npm i @litemetrics/ui recharts @tanstack/react-query` |
| `@litemetrics/core` | Shared types (auto-installed as dependency) | — |

## Quick Start Examples

### Add tracking to any website (script tag)

```html
<script src="https://your-server.com/tracker.js"></script>
<script>
  Litemetrics.createTracker({
    siteId: 'your-site-id',
    endpoint: 'https://your-server.com/api/collect',
  });
</script>
```

### Add tracking to a React app

```tsx
import { LitemetricsProvider } from '@litemetrics/react';

<LitemetricsProvider
  siteId="your-site-id"
  endpoint="https://your-server.com/api/collect"
  autoPageView
>
  <App />
</LitemetricsProvider>
```

### Add analytics server to Express

```ts
import { createCollector } from '@litemetrics/node';

const collector = await createCollector({
  db: { url: 'http://localhost:8123' }, // ClickHouse
});

app.all('/api/collect', (req, res) => collector.handler()(req, res));
app.all('/api/stats', (req, res) => collector.queryHandler()(req, res));
```

### Embed analytics dashboard in React

```tsx
import { LitemetricsProvider, AnalyticsDashboard } from '@litemetrics/ui';

<LitemetricsProvider baseUrl="https://your-server.com" siteId="xxx" secretKey="sk_...">
  <AnalyticsDashboard showWorldMap showPieCharts showExport />
</LitemetricsProvider>
```

## Detailed Integration Guides

Read the appropriate reference file based on the integration target:

- **Express / Node.js backend**: See [references/express-integration.md](references/express-integration.md) — collector setup, all API endpoints, CORS, MongoDB vs ClickHouse, config options
- **Browser tracker**: See [references/tracker-integration.md](references/tracker-integration.md) — script tag, NPM, auto-tracking features, Next.js/Vue/Svelte examples, manual API
- **React app**: See [references/react-integration.md](references/react-integration.md) — provider, hooks (usePageView, useLitemetrics, useTrackEvent), React Router
- **React Native / Expo**: See [references/react-native-integration.md](references/react-native-integration.md) — provider, navigation tracking, app state tracking
- **Dashboard UI components**: See [references/dashboard-ui-integration.md](references/dashboard-ui-integration.md) — AnalyticsDashboard, individual widgets, theming, dark mode, hooks
- **Querying from the CLI / terminal**: See [references/querying.md](references/querying.md) — `@litemetrics/cli` commands, metrics, filters, flags, agent patterns

## Environment Variables (Server)

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_ADAPTER` | `clickhouse`, `postgres`, or `mongodb` | `clickhouse` |
| `CLICKHOUSE_URL` | ClickHouse URL | `http://localhost:8123` |
| `MONGODB_URL` | MongoDB URL (when adapter=mongodb) | `mongodb://localhost:27017/litemetrics` |
| `ADMIN_SECRET` | Admin auth for site management | — |
| `PORT` | Server port | `3002` |

## Docker Deployment

```bash
# Docker Compose (ClickHouse + Litemetrics)
ADMIN_SECRET=your-secret docker compose up -d

# Standalone Docker
docker run -p 3002:3002 \
  -e CLICKHOUSE_URL=http://your-clickhouse:8123 \
  -e ADMIN_SECRET=your-secret \
  litemetrics
```

## Key Architecture Notes

- **Smart client, dumb server**: Session management, visitor IDs, batching all happen client-side in the tracker
- **Multi-tenant**: Single database with `site_id` isolation
- **ClickHouse default**: Columnar storage optimized for analytics queries. Postgres and MongoDB are also supported, with full feature parity.
- **~3KB tracker**: The browser tracker is ~3KB gzipped with all auto-tracking features
- Auto events are tagged with `event_source=auto` and a subtype: `link_click`, `outbound_click`, `file_download`, `button_click`, `scroll_depth`, `rage_click`. Data-attribute clicks are `event_source=manual` with `event_subtype=attribute`, and they suppress the auto click row for the same element.
- Manual `track()` events default to `event_source=manual` and `event_subtype=custom`. Older data may have `event_source` as null.
- Available metrics: `pageviews`, `visitors`, `sessions`, `events`, `conversions`, `top_pages`, `top_exit_pages`, `top_transitions`, `top_scroll_pages`, `top_referrers`, `top_channels`, `top_utm_sources`, `top_utm_mediums`, `top_utm_campaigns`, `top_utm_terms`, `top_utm_contents`, `top_countries`, `top_cities`, `top_devices`, `top_browsers`, `top_os`, `top_os_versions`, `top_device_models`, `top_app_versions`, `top_events`, `top_conversions`, `top_button_clicks`, `top_link_targets`, plus `timeseries`, `retention`, and `botStats`. The CLI's `metrics` / `filters` commands print the authoritative catalog — see [references/querying.md](references/querying.md).

## Conversions (by Event Name)

Conversions are just custom events whose names are listed in the site's `conversionEvents`.

Update a site (admin secret required):

```bash
curl -X PUT https://your-server.com/api/sites/<siteId> \
  -H "Content-Type: application/json" \
  -H "X-Litemetrics-Admin-Secret: <admin_secret>" \
  -d '{"conversionEvents":["Signup","Purchase"]}'
```

Query conversion metrics:

```ts
const conversions = await client.getStats('conversions', { period: '30d' });
const topConversions = await client.getStats('top_conversions', { period: '30d', limit: 10 });
```

## Segmentation Filters

All `getStats` and `getTimeSeries` calls accept `filters` for geo/device/UTM/referrer/event metadata:

```ts
const clicks = await client.getStats('top_button_clicks', {
  period: '7d',
  filters: {
    'device.type': 'mobile',
    'event_source': 'auto',
    'event_subtype': 'button_click',
  },
});
```
