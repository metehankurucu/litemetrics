# Getting Started

Litemetrics runs inside your existing Node.js server with ClickHouse (default), Postgres, or MongoDB. No separate service needed.

## 1. Add the Collector

```bash
bun add @litemetrics/node
```

```ts
import express from 'express';
import { createCollector } from '@litemetrics/node';

const app = express();
app.use(express.json());

const collector = await createCollector({
  db: { url: process.env.CLICKHOUSE_URL || 'http://localhost:8123' },
  adminSecret: 'change-me',
});

app.all('/api/collect', (req, res) => collector.handler()(req, res));
app.all('/api/stats', (req, res) => collector.queryHandler()(req, res));
app.all('/api/events', (req, res) => collector.eventsHandler()(req, res));
app.all('/api/users', (req, res) => collector.usersHandler()(req, res));
app.all('/api/users/*', (req, res) => collector.usersHandler()(req, res));
app.all('/api/sites', (req, res) => collector.sitesHandler()(req, res));
app.all('/api/sites/*', (req, res) => collector.sitesHandler()(req, res));

app.listen(3002);
```

This creates 3 tables (`litemetrics_events`, `litemetrics_sites`, `litemetrics_identity_map`) on first start. Existing data is not touched.

> Bot filtering is enabled by default (`BOT_FILTER_MODE=standard`). Crawlers, headless browsers, and scrubbed user agents are excluded from queries automatically. Set `BOT_FILTER_MODE=off` if you want every event counted, or see [Self-Hosting](./self-hosting.md#bot-filtering) for the full mode list.

Using Postgres? Pass `{ adapter: 'postgres', url: 'postgres://user:pass@localhost:5432/myapp' }` to `db`.

Using MongoDB? Pass `{ adapter: 'mongodb', url: 'mongodb://localhost:27017/myapp' }` to `db`.

## 2. Create a Site

**Programmatically:**

```ts
const site = await collector.createSite({ name: 'My App', domain: 'myapp.com' });
console.log(site.siteId);    // site_abc123
console.log(site.secretKey);  // sk_...
```

**Via API:**

```bash
curl -X POST http://localhost:3002/api/sites \
  -H "Content-Type: application/json" \
  -H "X-Litemetrics-Admin-Secret: change-me" \
  -d '{"name": "My App"}'
```

Save the `siteId` (public, goes in the tracker) and `secretKey` (private, for reading data).

## 3. Add the Tracker

**HTML:**

```html
<script src="http://localhost:3002/litemetrics.js"></script>
<script>
  Litemetrics.createTracker({
    siteId: 'YOUR_SITE_ID',
    endpoint: 'http://localhost:3002/api/collect'
  });
</script>
```

**React:**

```bash
bun add @litemetrics/react
```

```tsx
import { LitemetricsProvider } from '@litemetrics/react';

function App() {
  return (
    <LitemetricsProvider siteId="YOUR_SITE_ID" endpoint="http://localhost:3002/api/collect">
      <YourApp />
    </LitemetricsProvider>
  );
}
```

**React Native / Expo:**

```bash
bun add @litemetrics/react-native
```

> Create the site with `type: 'app'` (`litemetrics sites create -n "My App" --type app`, or `POST /api/sites` with `{"type":"app"}`). On a `web` site the bot filter treats the SDK's traffic as browser traffic and drops Android's default `okhttp/<version>` User-Agent, so every Android event is lost. See [Self-Hosting → Bot Filtering](./self-hosting.md#bot-filtering).

```tsx
import { LitemetricsProvider } from '@litemetrics/react-native';

function App() {
  return (
    <LitemetricsProvider siteId="YOUR_SITE_ID" endpoint="http://localhost:3002/api/collect">
      <YourApp />
    </LitemetricsProvider>
  );
}
```

The tracker automatically tracks pageviews, detects SPA navigation, batches events, and generates anonymous visitor/session IDs client-side.

## 4. See Your Data

**CLI:**

```bash
bun add -g @litemetrics/cli

litemetrics overview -p 7d --compare \
  --url http://localhost:3002 \
  --secret YOUR_ADMIN_SECRET \
  --site YOUR_SITE_ID
```

**API:**

```bash
curl "http://localhost:3002/api/stats?siteId=YOUR_SITE_ID&metric=pageviews&period=7d" \
  -H "X-Litemetrics-Secret: YOUR_SECRET_KEY"
```

Or use the [Dashboard](./dashboard.md) or the [CLI](../packages/cli/README.md).

## 5. Run the Mobile App (Optional)

Litemetrics includes a native mobile app (`apps/mobile`) for viewing analytics and managing sites.

```bash
cd apps/mobile
bun install
bun run start
```

Then open the Expo launcher for iOS/Android:

```bash
bun run ios
bun run android
```

When the app opens:
- Add your provider URL (for example `https://analytics.yoursite.com`)
- Enter the admin secret for that server
- Select a site to start viewing analytics

## Data-Attribute Tracking

Track clicks without writing JavaScript. Add `data-litemetrics-event` to any element:

```html
<button data-litemetrics-event="Signup" data-litemetrics-event-plan="pro">Sign Up</button>
```

Clicking this tracks a `Signup` event with `{ plan: "pro" }` as properties.

## Multi-Tenant Usage

Each customer gets their own site. All data is isolated by `siteId` in a single database:

```ts
const site = await collector.createSite({ name: customerName, domain: customerDomain });
// Store site.siteId and site.secretKey in your customer record
```

## Next

- [Integration Guide](./integration-guide.md) -- React, Next.js, Vue, React Native, and more
- [API Reference](./api-reference.md) -- Full endpoint docs
- [Dashboard](./dashboard.md) -- Analytics dashboard
- [CLI](../packages/cli/README.md) -- Terminal access to analytics (human + AI agent friendly)
- [Mobile App](../apps/mobile/README.md) -- Mobile app usage and pre-release checklist
- [Self-Hosting](./self-hosting.md) -- Docker and production deployment
