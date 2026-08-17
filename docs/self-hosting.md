# Self-Hosting

Litemetrics ships as a single Docker image. It bundles the server, dashboard, tracker script, and all API endpoints.

## Quick Deploy

### Railway (one click)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/litemetrics?referralCode=litemetrics)

1. Click the button, add a database plugin: Postgres, ClickHouse, or MongoDB
2. Set `DB_ADAPTER` (`postgres`, `clickhouse`, or `mongodb`), the matching connection URL (`POSTGRES_URL`, `CLICKHOUSE_URL`, or `MONGODB_URL`), and `ADMIN_SECRET` env vars
3. Deploy

### Docker Compose (recommended)

```bash
git clone https://github.com/metehankurucu/litemetrics.git
cd litemetrics
ADMIN_SECRET=your-secret docker compose up -d
```

This starts ClickHouse and Litemetrics together with healthchecks and persistent volumes.

### Docker (standalone)

```bash
docker build -t litemetrics .
docker run -p 3002:3002 \
  -e CLICKHOUSE_URL=http://your-clickhouse:8123 \
  -e ADMIN_SECRET=your-secret \
  litemetrics
```

Open `http://localhost:3002` for the dashboard.

## What the container serves

| Path | Description |
|------|-------------|
| `/` | Dashboard UI |
| `/tracker.js` | Browser tracker script |
| `/litemetrics.js` | Same tracker (alias) |
| `/api/collect` | Event ingestion |
| `/api/stats` | Query analytics |
| `/api/events` | List events |
| `/api/users` | List users |
| `/api/sites` | Site management |
| `/health` | Health check endpoint |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_ADAPTER` | Database adapter (`clickhouse`, `postgres`, or `mongodb`) | `clickhouse` |
| `CLICKHOUSE_URL` | ClickHouse connection URL | `http://localhost:8123` |
| `POSTGRES_URL` | Postgres connection string (when using postgres adapter) | `postgres://postgres:postgres@localhost:5432/litemetrics` |
| `MONGODB_URL` | MongoDB connection string (when using mongodb adapter) | `mongodb://localhost:27017/litemetrics` |
| `ADMIN_SECRET` | Secret for admin login and site management | _(none)_ |
| `PORT` | Server port | `3002` |
| `GEOIP` | Enable GeoIP lookup | `true` |
| `TRUST_PROXY` | Trust X-Forwarded-For headers | `true` |
| `BOT_FILTER_MODE` | Server-wide bot filter default: `off`, `standard`, `strict`, or `shadow` | `standard` |
| `BOT_RATE_WINDOW_MS` | Sliding-window size for the per-IP rate limiter (ms) | `60000` |
| `BOT_RATE_MAX` | Max events per window per IP before the rate-limit layer fires | `60` |
| `BOT_LOG_MAX_PER_MIN` | Detail `[bot-filter]` log lines allowed per minute; the overflow is counted as `suppressed=` on the `[collect]` summary | `20` |

`DATABASE_URL` and `LITEMETRICS_ADMIN_SECRET` also work as aliases.

## Bot Filtering

Bot filtering runs in three server-side layers (signature via `isbot`, heuristic for scrubbed UAs, per-IP rate limit) plus a tracker-side `navigator.webdriver` short-circuit. It is enabled by default in `standard` mode.

- `BOT_FILTER_MODE=standard` (default): Layer 1 drops, Layers 2 + 3 flag (events stored with `bot_flag`, hidden from queries).
- `BOT_FILTER_MODE=strict`: every layer drops.
- `BOT_FILTER_MODE=shadow`: every layer flags only — useful for tuning thresholds without affecting data.
- `BOT_FILTER_MODE=off`: disabled.

Per-site overrides live on the site record (`botFilterMode` field) and are configurable from the dashboard Settings page. Each detection emits a grep-friendly audit line:

```
[bot-filter] <action> layer=<layer> reason=<reason> mode=<mode> site=<siteId> ip=<ip> ua="<user-agent>"
```

`layer` is which of the three layers fired; `reason` is why. The distinction matters in practice: the signature layer fires both for a missing User-Agent and for an `isbot` list match, and those call for opposite responses.

| `reason` | Layer | Meaning |
|------|-------|---------|
| `empty-ua` | signature / heuristic | No `User-Agent` header at all — usually a misconfigured SDK rather than a crawler |
| `ua-signature` | signature | Matched the `isbot` list. Real crawlers, but also HTTP client defaults such as `okhttp/*` — the Android default, which React Native's `fetch` sends when the caller sets no User-Agent |
| `no-browser-signals` | heuristic | Browser, engine, `Accept-Language` and `Referer` were all absent |
| `rate-limit` | rate-limit | The per-IP sliding window overflowed |

If mobile SDK traffic is missing from your data, grep for `reason=ua-signature` and check the `ua` field — a native HTTP client that sends no explicit User-Agent gets a library default that `isbot` matches.

`ua` is sanitized to a single line and capped at 200 characters. Detail lines are limited to `BOT_LOG_MAX_PER_MIN` per minute; the overflow is counted as `suppressed=` on the `[collect]` summary line.

To include flagged traffic in queries, pass `?includeBots=true` on `/api/stats`, `/api/events`, or `/api/users`.

## Request logs

`/api/collect` is not logged per request — at production volume that alone fills a fixed-size platform log window in hours. Each wall-clock minute with traffic emits one summary line instead:

```
[collect] minute=2026-08-16T11:13 reqs=17 ok=14 3xx=0 4xx=3 5xx=0 dur_p50=3 dur_p95=155 dur_max=155 bot_dropped=9 bot_flagged=0 reasons=ua-signature:8,empty-ua:1 bot_sites=site_e2e:9 suppressed=6
```

| Field | Meaning |
|-------|---------|
| `reqs` / `ok` / `3xx` / `4xx` / `5xx` | Requests in the minute, by response status class |
| `dur_p50` / `dur_p95` / `dur_max` | Response time in ms; `-` when the minute saw no requests |
| `bot_dropped` / `bot_flagged` | Bot-filter outcomes. These totals survive after the individual detail lines age out |
| `reasons` | Drop reasons for the minute, by count |
| `bot_sites` | Sites by **bot hit** count — not request volume, which is `reqs` |
| `suppressed` | Detail `[bot-filter]` lines withheld by `BOT_LOG_MAX_PER_MIN` |

Notes for operators:

- A minute with no traffic emits no line at all.
- The open minute is flushed on `SIGTERM` / `SIGINT`, so a redeploy does not lose the window a deploy-triggered problem would appear in.
- The logger runs before CORS and the body parser, so a request whose body never finishes arriving is still counted rather than vanishing.
- Every other route keeps a per-request line: `14:59:31 GET /api/stats?siteId=site_x 200 42ms [secret]`.

User-Agent, IP, site id and URL all come from the request and are therefore attacker-controlled. Each is sanitized to a single line before entering a log entry — without that, one newline in a User-Agent would let a request forge its own log records.

## Schema migrations

Schema changes from 0.6.x are applied lazily on adapter init and are idempotent — restarting the server is enough to upgrade. The Postgres adapter runs `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for new bot-filter columns; ClickHouse and MongoDB equivalents are also no-ops on re-run. No manual SQL is required.

## Using Postgres Instead

To use Postgres instead of ClickHouse, set `DB_ADAPTER=postgres`:

```bash
docker run -p 3002:3002 \
  -e DB_ADAPTER=postgres \
  -e POSTGRES_URL=postgres://user:pass@your-postgres:5432/litemetrics \
  -e ADMIN_SECRET=your-secret \
  litemetrics
```

Tables are auto-created on first start. Recommended when you already run Postgres for your app and want one less moving piece. Full feature parity with ClickHouse — every metric, time series, top-N query, and retention cohort returns identical results.

## Using MongoDB Instead

To use MongoDB instead of ClickHouse, set `DB_ADAPTER=mongodb`:

```bash
docker run -p 3002:3002 \
  -e DB_ADAPTER=mongodb \
  -e MONGODB_URL=mongodb://your-mongo:27017/litemetrics \
  -e ADMIN_SECRET=your-secret \
  litemetrics
```

Or with Docker Compose, use the mongodb profile:

```bash
docker compose --profile mongodb up -d
```

## Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name analytics.yoursite.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name analytics.yoursite.com;

    ssl_certificate /etc/letsencrypt/live/analytics.yoursite.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/analytics.yoursite.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d analytics.yoursite.com
```

## ClickHouse Notes

For production:
- ClickHouse uses MergeTree for events (partitioned by month) and ReplacingMergeTree for sites
- Data is stored in named Docker volumes (`clickhouse_data`) and persists across container restarts/updates
- ClickHouse handles millions of events with sub-second query latency
- For backups, use `clickhouse-backup` tool

## Postgres Notes

If using the Postgres adapter:
- Schema (tables and indexes) is auto-created on first start
- Events use native `jsonb` for properties/traits and a composite `(site_id, timestamp)` index for fast range scans
- Sites use a `deleted_at` soft-delete column to mirror ClickHouse semantics
- For backups, use `pg_dump` or your provider's snapshot feature (Supabase, Neon, RDS, Railway PG plugin)
- Pgs at scale (>10M events) benefit from monthly partitioning; the schema is partition-friendly but not partitioned by default

## MongoDB Notes

If using MongoDB adapter:
- Enable authentication: `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD`
- Set up backups with `mongodump`
- MongoDB Atlas free tier (512MB) handles ~10 apps with 1K users each
- For larger deployments, see [Scaling](./scaling.md)
