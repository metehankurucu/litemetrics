# Getting Started

Litemetrics runs inside your existing Node.js server with ClickHouse (default) or MongoDB. No separate service needed.

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

This creates 2 tables in ClickHouse (`litemetrics_events` and `litemetrics_sites`). Existing data is not touched.

Using MongoDB instead? Pass `{ adapter: 'mongodb', url: 'mongodb://localhost:27017/myapp' }` to `db`.

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

```bash
curl "http://localhost:3002/api/stats?siteId=YOUR_SITE_ID&metric=pageviews&period=7d" \
  -H "X-Litemetrics-Secret: YOUR_SECRET_KEY"
```

Or use the [Dashboard](./dashboard.md).

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
- [Self-Hosting](./self-hosting.md) -- Docker and production deployment
