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
| `BOT_RATE_MAX` | Max collect **requests** per window per IP before the rate-limit layer fires (one request can carry up to 100 events) | `60` |
| `BOT_VELOCITY_WINDOW_MS` | Sliding-window size for the per-visitor velocity layer (ms) | `10000` |
| `BOT_VELOCITY_MAX_PAGEVIEWS` | Max **pageviews** one `siteId:visitorId` pair may send per window before the velocity layer fires. `0` switches this layer off without switching the filter off | `60` |
| `BOT_VELOCITY_MAX_KEYS` | Cap on tracked `siteId:visitorId` windows; the least recently used is evicted past it | `50000` |
| `BOT_LOG_MAX_PER_MIN` | Detail `[bot-filter]` log lines allowed per minute; the overflow is counted as `suppressed=` on the `[collect]` summary | `20` |
| `COLLECT_ERROR_LOG_MAX_PER_MIN` | Detail `[collect-error]` log lines allowed per minute; every failure is still counted in `err_codes=` on the `[collect]` summary | `5` |

`DATABASE_URL` and `LITEMETRICS_ADMIN_SECRET` also work as aliases.

## Bot Filtering

Bot filtering runs in four server-side layers, evaluated in this order: signature via `isbot`, heuristic for scrubbed UAs, per-IP rate limit, then per-visitor velocity. A tracker-side `navigator.webdriver` short-circuit sits in front of all of them. Layers 1 and 2 skip the per-IP window when they fire, because neither ever admits an unflagged row: either the request returns and nothing is stored, or the whole batch is stored carrying the flag. The velocity layer does not get that exemption, because it flags or drops one visitor and stores the rest of the batch unflagged. It is enabled by default in `standard` mode. The rate-limit window counts collect requests rather than events, and one window is shared across every site served by the process.

Layer 4 exists because the first three all judge a single request: two read its headers, and the per-IP window counts *requests*, so a client that batches (the tracker batches by default) and rotates addresses shows up as a quiet IP. It caps how many **pageviews** one `siteId:visitorId` pair may send inside `BOT_VELOCITY_WINDOW_MS`. Only pageviews count: rage clicks and scroll-depth events are dozens a minute by design. Note what the key is and is not: it is a visitor rather than an address, so a shared NAT is not pooled by its IP, but a `visitorId` is a **device fingerprint for one day, not a person**, and the client is what sends it (the browser tracker hashes `hostname|day|User-Agent|language|timezone|screen`, `packages/tracker/src/session.ts`). Two visitors on the same site, on the same day, with the same browser build, locale, timezone and screen size therefore send the *same* id and do share one window: roughly 6 pageviews a second between them reaches the default threshold. Because the inputs are observable, that id can also be **forged**: a caller can compute a common visitor's id and burn its window on purpose, which hides that visitor's next pageviews from the default reports under `standard`, and drops them under `strict`. Adding the IP to the key would close that and would also hand the address-rotating client this layer exists for a free pass, so it is not done; run `shadow` if you want to see the layer's verdicts before they affect anything - noting that Layer 3 still answers first there too, so a busy address masks Layer 4's verdicts and `byVelocity` under-reports; RAISE `BOT_RATE_MAX` to see them, do not lower it. The React Native SDK is unaffected either way: it draws a random per-install id. Once a visitor is over the line, every event of that visitor in the same batch is acted on, custom events and `identify` included; only pageviews *count* toward the window. The window is in memory and per process, so behind N collector instances a visitor's events split N ways and need N times the rate to trip - the per-IP window has the same property.

A visitor's first 60 pageviews in a window go through unflagged, so sustained traffic under 6 pageviews a second never trips this layer. Once a visitor is over the line, every further pageview is flagged for as long as it keeps above that rate; the window also counts the pageviews it flagged, and the visitor is clean again one window after it slows. **How many of a burst's pageviews carry the flag depends on how the client batched them**, because the layer decides once per request: the same 71 pageviews arriving as seven batches of 10 and one of 1 have 11 flagged (the batch that carries the 61st, and the one after it), while all 71 in a single call are flagged together. Neither number is a tuning knob, it is where the request boundaries fell. What is stable is the threshold: nothing is flagged until a visitor's window overflows. It is not tighter because `autoSpa` is on by default and the tracker de-dupes navigations on the full URL, so a UI that mirrors its state into the URL (a search box syncing `?q=`, filter chips) emits one pageview per URL write: an average 180-CPM typist in such a field produces three a second, and 30 per 10 seconds would flag them. Raise `BOT_VELOCITY_MAX_PAGEVIEWS`, or set it to `0`, if your own UI still trips it. The window measures arrival time, so a React Native client that was offline and replays a backlog of more than 60 screen views in one request is flagged as a burst (the SDK does not pace a replayed backlog yet). `BOT_VELOCITY_MAX_KEYS` bounds how many visitor windows are tracked at once; past it the least recently used window is dropped, so a client sending rotating visitor ids can evict real ones. A `visitorId` longer than 128 characters is skipped rather than keyed, which means it is also never counted: that is a free pass through this layer, and it grants nothing a rotating id does not already grant. The events are still stored and still counted by the per-IP layer. It is higher than the per-IP cap because this layer admits up to one new key per pageview against the per-IP layer's one per request.

Sites typed `app` run the rate-limit and velocity layers only: the signature and heuristic layers are browser heuristics and an app SDK sends no browser User-Agent (React Native on Android goes out as `okhttp/<version>`, which `isbot` matches). A site that receives app SDK traffic must be created with `type: 'app'`, or it is filtered as browser traffic: the SDK's `litemetrics-react-native/<version> (<platform>)` User-Agent escapes Layer 1 but trips Layer 2 (no browser, no engine, no `Accept-Language`, no `Referer`), so `standard` hides that traffic from every report and `strict` drops it. The server logs `[site-type-mismatch] site=<id> type=<type> platform=<platform> mode=<mode>` once per site when it sees app SDK payloads on a non-app site.

- `BOT_FILTER_MODE=standard` (default): Layer 1 drops, Layers 2, 3 and 4 flag (events stored with `bot_flag`, hidden from queries, countable via `litemetrics bots` and readable again with `?includeBots=true`). On `app` sites only Layers 3 and 4 run, and both flag.
- `BOT_FILTER_MODE=strict`: every layer drops (`app` sites: rate limit and velocity only).
- `BOT_FILTER_MODE=shadow`: every layer flags only — useful for tuning thresholds without affecting data (`app` sites: rate limit and velocity only).
- `BOT_FILTER_MODE=off`: disabled.

Per-site overrides live on the site record (`botFilterMode` field) and are configurable from the dashboard Settings page. Each detection emits a grep-friendly audit line:

```
[bot-filter] <action> layer=<layer> reason=<reason> mode=<mode> events=<n> site=<siteId> ip=<ip> ua="<user-agent>"
```

`layer` is which of the four layers fired; `reason` is why; `events` is how much of the batch the action covered. That last one matters for Layer 4 alone: layers 1 to 3 act on the request, so `events` is the whole batch, while Layer 4 acts on the visitors that overflowed, so a `dropped layer=velocity events=5` line on a 60-event batch means 55 events were stored. The distinction matters in practice: the signature layer fires both for a missing User-Agent and for an `isbot` list match, and those call for opposite responses.

| `reason` | Layer | Meaning |
|------|-------|---------|
| `empty-ua` | signature / heuristic | No `User-Agent` header at all — usually a misconfigured SDK rather than a crawler |
| `ua-signature` | signature | Matched the `isbot` list. Real crawlers, but also HTTP client defaults such as `okhttp/*` — the Android default, which React Native's `fetch` sends when the caller sets no User-Agent |
| `no-browser-signals` | heuristic | Browser, engine, `Accept-Language` and `Referer` were all absent |
| `rate-limit` | rate-limit | The per-IP sliding window overflowed |
| `velocity` | velocity | One `visitorId` sent more pageviews inside `BOT_VELOCITY_WINDOW_MS` than a person can read |

If mobile SDK traffic is missing from your data, grep for `reason=ua-signature` and check the `ua` field — a native HTTP client that sends no explicit User-Agent gets a library default that `isbot` matches.

`ua` is sanitized to a single line and capped at 200 characters. Detail lines are limited to `BOT_LOG_MAX_PER_MIN` per minute; the overflow is counted as `suppressed=` on the `[collect]` summary line.

To include flagged traffic in queries, pass `?includeBots=true` on `/api/stats`, `/api/events`, or `/api/users`.

## Request logs

`/api/collect` is not logged per request — at production volume that alone fills a fixed-size platform log window in hours. Each wall-clock minute with traffic emits one summary line instead:

```
[collect] minute=2026-08-18T17:35 reqs=11 ok=8 3xx=0 4xx=0 5xx=0 aborted=3 dur_p50=302 dur_p95=712 dur_max=712 bot_dropped=5 bot_flagged=0 reasons=ua-signature:4,empty-ua:1 bot_sites=site_e2e:5 suppressed=2 err_codes=-
```

| Field | Meaning |
|-------|---------|
| `reqs` / `ok` / `3xx` / `4xx` / `5xx` | Requests in the minute, by response status class |
| `aborted` | Requests the client gave up on — body never finished arriving, or hung up before the answer went out. Its own class: `reqs = ok + 3xx + 4xx + 5xx + aborted` |
| `dur_p50` / `dur_p95` / `dur_max` | Response time in ms; `-` when the minute saw no requests |
| `bot_dropped` / `bot_flagged` | Bot-filter outcomes. These totals survive after the individual detail lines age out |
| `reasons` | Drop reasons for the minute, by count |
| `bot_sites` | Sites by **bot hit** count — not request volume, which is `reqs` |
| `suppressed` | Detail `[bot-filter]` lines withheld by `BOT_LOG_MAX_PER_MIN` |
| `err_codes` | Top 10 collect failure keys as `<stage>:<class>:<count>`, plus `other:N` for omitted occurrences and `untracked:N` for occurrences beyond the 50-key tracking cap; `-` when there were none |

A collect request that ends in a 500 also writes a detail line:

```
[collect-error] stage=<parse|validate|site|identity|insert> class=<code or error class> site=<siteId> events=<batch size> msg="<message>"
```

`stage` is how far the request got, so a database outage (`stage=site` or `stage=insert`, `class=ECONNREFUSED`) is distinguishable from one broken caller (`stage=parse`, `class=SyntaxError`) without reproducing anything. `msg` is capped at 160 characters and credentials in a connection string the driver quotes back are redacted to `scheme://***@host`.

Notes for operators:

- A minute with no traffic emits no line at all (a minute that saw only a collect failure still does).
- `[collect-error]` detail lines are capped at `COLLECT_ERROR_LOG_MAX_PER_MIN` per minute. The withheld ones are not counted in `suppressed=`, which is bot-filter only; derive them by subtracting the printed lines from that minute's `err_codes=` total. Sum every named count, `other:N` and `untracked:N` to obtain that total; both tail values count failure occurrences.
- The open minute is flushed on `SIGTERM` / `SIGINT`, so a redeploy does not lose the window a deploy-triggered problem would appear in.
- The logger runs before CORS and the body parser and records on the first of the handler's `res.end`, `res 'close'`, or a cut-off request body, so a request whose body never finishes arriving — or whose client hangs up before the answer — is counted as `aborted` rather than vanishing. This holds under both Node and Bun (the Docker image runs Bun: its `node` is a bun symlink, and Bun's `http` emits no `res 'close'` for an aborted request).
- Every other route keeps a per-request line: `14:59:31 GET /api/stats?siteId=site_x 200 42ms [secret]`, with a trailing `aborted` marker when the client left before the answer went out.

User-Agent, IP, site id and URL all come from the request and are therefore attacker-controlled. Each is sanitized to a single line before entering a log entry — without that, one newline in a User-Agent would let a request forge its own log records.

## Schema migrations

Schema changes from 0.6.x are applied lazily on adapter init and are idempotent — restarting the server is enough to upgrade. The Postgres adapter runs `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, first for the bot-filter columns (0.6.0) and then for the ad click ID columns `gclid` / `gbraid` / `wbraid` / `fbclid` / `fbp` (0.9.0); the ClickHouse equivalents are also no-ops on re-run, and MongoDB is schemaless. No manual SQL and no backfill is required — rows written before an upgrade simply keep `NULL` in the new columns.

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
