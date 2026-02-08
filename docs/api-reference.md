# API Reference

## Authentication

- **Admin Secret** -- Full access to site management. Header: `X-Litemetrics-Admin-Secret`
- **Site Secret** -- Read access to a site's analytics. Header: `X-Litemetrics-Secret`
- The collect endpoint is public (no auth).

---

## POST /api/collect

Receives batched events from the tracker.

**Body:**

```json
{
  "events": [
    {
      "type": "pageview",
      "siteId": "site_abc123",
      "timestamp": 1700000000000,
      "sessionId": "sess_xyz",
      "visitorId": "vis_xyz",
      "url": "https://mysite.com/about",
      "referrer": "https://google.com",
      "title": "About Us",
      "screen": { "width": 1920, "height": 1080 },
      "language": "en-US",
      "timezone": "America/New_York"
    }
  ]
}
```

**Event types:**

| Type | Required Fields | Optional Fields |
|------|----------------|-----------------|
| `pageview` | `siteId`, `timestamp`, `sessionId`, `visitorId`, `url` | `referrer`, `title`, `screen`, `language`, `timezone`, `utm`, `connection` |
| `event` | `siteId`, `timestamp`, `sessionId`, `visitorId`, `name` | `properties`, `screen`, `language`, `timezone`, `utm`, `connection` |
| `identify` | `siteId`, `timestamp`, `sessionId`, `visitorId`, `userId` | `traits`, `screen`, `language`, `timezone`, `utm`, `connection` |

Max 100 events per request.

**Response:** `{ "ok": true }`

---

## GET /api/stats

Query analytics metrics for a site.

**Headers:** `X-Litemetrics-Secret: sk_your_secret_key`

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `siteId` | string | Yes | Site identifier |
| `metric` | string | Yes | Metric to query (see below) |
| `period` | string | No | `1h`, `24h`, `7d`, `30d`, `90d`, `custom` |
| `dateFrom` | string | No | Start date (ISO 8601). Required with `period=custom` |
| `dateTo` | string | No | End date (ISO 8601). Required with `period=custom` |
| `limit` | number | No | Max results for top_* metrics (default: 10) |
| `compare` | boolean | No | Include previous period comparison |
| `filters` | JSON string | No | Filter by field, e.g. `{"device.browser":"Chrome"}` |

**Metrics:**

| Metric | Returns |
|--------|---------|
| `pageviews` | Total pageview count |
| `visitors` | Unique visitor count |
| `sessions` | Unique session count |
| `events` | Custom event count |
| `top_pages` | Most visited URLs |
| `top_referrers` | Top traffic sources |
| `top_countries` | Visitors by country |
| `top_cities` | Visitors by city |
| `top_events` | Most triggered events |
| `conversions` | Total conversion count (events matching site conversion list) |
| `top_conversions` | Most triggered conversion events |
| `top_devices` | Device type breakdown |
| `top_browsers` | Browser breakdown |
| `top_os` | OS breakdown |
| `retention` | Cohort retention data |

**Response (count):**

```json
{
  "metric": "pageviews",
  "period": "7d",
  "data": [{ "key": "pageviews", "value": 1523 }],
  "total": 1523
}
```

**Response (top_*):**

```json
{
  "metric": "top_pages",
  "period": "7d",
  "data": [
    { "key": "/", "value": 450 },
    { "key": "/about", "value": 230 }
  ],
  "total": 680
}
```

**Response (with compare=true):**

When `compare=true`, each data item includes `previous` and `changePercent`:

```json
{
  "metric": "pageviews",
  "period": "7d",
  "data": [{ "key": "pageviews", "value": 1523, "previous": 1200, "changePercent": 26.9 }],
  "total": 1523
}
```

**Retention query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `weeks` | number | 8 | Number of retention weeks to calculate |

**Response (retention):**

```json
{
  "cohorts": [
    {
      "week": "2024-W01",
      "size": 150,
      "retention": [100, 45.3, 32.1, 28.5]
    }
  ]
}
```

---

## GET /api/stats (timeseries)

Time series data uses the same endpoint with `metric=timeseries`.

**Additional parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `timeseries_metric` | string | `pageviews` | `pageviews`, `visitors`, or `sessions` |
| `granularity` | string | auto | `hour`, `day`, `week`, or `month` |

**Response:**

```json
{
  "data": [
    { "date": "2024-01-15", "value": 120 },
    { "date": "2024-01-16", "value": 145 }
  ]
}
```

---

## GET /api/events

List tracked events with pagination.

**Headers:** `X-Litemetrics-Secret: sk_your_secret_key`

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `siteId` | string | -- | Site identifier |
| `period` | string | `7d` | Time period |
| `type` | string | -- | Filter by event type (`pageview`, `event`, `identify`) |
| `eventName` | string | -- | Filter by a single event name |
| `eventNames` | string | -- | Comma-separated list of event names |
| `limit` | number | 50 | Events per page |
| `offset` | number | 0 | Pagination offset |

**Response:**

```json
{
  "events": [
    {
      "type": "pageview",
      "siteId": "site_abc",
      "timestamp": 1700000000000,
      "url": "/about",
      "visitorId": "vis_xyz",
      "device": { "browser": "Chrome", "os": "macOS", "type": "desktop" }
    }
  ],
  "total": 1523,
  "page": 1,
  "limit": 50
}
```

---

## GET /api/users

List tracked visitors.

**Headers:** `X-Litemetrics-Secret: sk_your_secret_key`

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `siteId` | string | -- | Site identifier |
| `period` | string | `7d` | Time period |
| `search` | string | -- | Search by visitor ID or user ID |
| `page` | number | 1 | Page number |
| `limit` | number | 50 | Users per page |

## GET /api/users/:visitorId

Get a single visitor's profile and summary stats.

## GET /api/users/:visitorId/events

Get a visitor's event history.

---

## Site Management -- /api/sites

All endpoints require `X-Litemetrics-Admin-Secret` header.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sites` | List all sites |
| `POST` | `/api/sites` | Create a site |
| `GET` | `/api/sites/:siteId` | Get a site |
| `PUT` | `/api/sites/:siteId` | Update a site |
| `DELETE` | `/api/sites/:siteId` | Delete a site |
| `POST` | `/api/sites/:siteId/regenerate` | Regenerate secret key |

**Create site body:**

```json
{
  "name": "My Website",
  "domain": "mysite.com",
  "allowedOrigins": ["https://mysite.com"],
  "conversionEvents": ["Signup", "Purchase"]
}
```

---

## Programmatic Usage

The collector also exposes methods for server-side use:

```ts
await collector.track('site_abc', 'purchase', { amount: 99 }, {
  userId: 'user_123',
  ip: '203.0.113.1'
});

await collector.identify('site_abc', 'user_123', {
  name: 'John',
  plan: 'pro'
});

const result = await collector.query({
  siteId: 'site_abc',
  metric: 'pageviews',
  period: '30d',
});
```
