# Scaling

Current architecture and what to change as traffic grows.

## Current Setup (ClickHouse)

| Component | Implementation |
|-----------|---------------|
| Event ingestion | `POST /api/collect` → batch insert to ClickHouse |
| Query engine | ClickHouse SQL (columnar, analytics-optimized) |
| Unique counts | `uniq()` (HyperLogLog-based) |
| Caching | None |
| Rate limiting | In-process bot filter: per-IP window (Layer 3) and per-visitor pageview window (Layer 4), both in memory |
| Client-side batching | 10 events or 5s interval |
| Average event size | ~700 bytes |

ClickHouse is a columnar database designed for analytics workloads. It handles millions of events with sub-second query latency out of the box.

## Capacity Estimates

### Small (10 Apps x 1K Users)

| Metric | Value |
|--------|-------|
| Events/month | ~250K |
| Peak requests/sec | ~0.5 RPS |
| Storage/month | ~175 MB |
| Query latency (p95) | <50ms |

A single ClickHouse instance handles this easily.

### Medium (100 Apps x 10K Users)

| Metric | Value |
|--------|-------|
| Events/month | ~25M |
| Peak requests/sec | ~10 RPS |
| Storage/month | ~17 GB |
| Query latency (p95) | <200ms |

Still fine with a single ClickHouse instance. ClickHouse compresses columnar data efficiently.

## Known Bottlenecks

### 1. No Query Cache

Every dashboard load runs SQL queries. Same query recalculated each time.

- Fix: Redis or in-memory cache with 5-minute TTL

### 2. The Bot Filter Windows Live In One Process

The collect endpoint is rate limited, but only inside the process that received the request.
Layer 3 keeps a sliding window per IP (`BOT_RATE_MAX` collect requests per `BOT_RATE_WINDOW_MS`)
and Layer 4 one per `siteId:visitorId` (`BOT_VELOCITY_MAX_PAGEVIEWS` pageviews per
`BOT_VELOCITY_WINDOW_MS`). Both are plain in-memory Maps, so they have two properties that
matter the moment you scale past one instance:

- **They go blind as you add replicas.** A load balancer spreads one visitor's requests across
  N processes, so each window sees roughly 1/N of the traffic and the effective threshold
  becomes N times the configured one. The default Layer 4 threshold is 6 pageviews a second;
  at 4 replicas a visitor has to sustain 24 a second to be flagged anywhere, which is above the
  slow half of the 20-71 pageviews a second this layer was built for. Plan for shared state
  (Redis or the edge/CDN's own rate limiter) at the same time you plan for the second instance,
  or lower `BOT_VELOCITY_MAX_PAGEVIEWS` and `BOT_RATE_MAX` by roughly the replica count and
  accept the false positives that buys.
- **They cost memory per tracked key.** A window is its key plus up to `maxEvents` timestamps,
  which is roughly 1 KB at the shipped thresholds, and it is held until it is evicted. Layer 4
  tracks up to `BOT_VELOCITY_MAX_KEYS` (default 50 000) windows, so its ceiling is on the order
  of 40 MB per process, reached only when every window is full. Layer 3 tracks 10 000 keys on
  the same shape. Both LRU-evict past the cap rather than growing, so the ceiling holds under a
  flood of rotating ids, but eviction is also what such a flood is buying: evict the real
  windows and the layer goes quiet until they refill.

- Fix: shared window state (Redis) or an edge rate limiter, once you run more than one instance

### 3. Single Server

One Node.js process handles both ingestion and queries.

- Fix: Separate ingestion and query servers, or add load balancer

## Scaling Roadmap

| Scale | Traffic | What to Add |
|-------|---------|-------------|
| Hobby (current) | ~0.5 RPS | Nothing needed |
| Startup | ~5 RPS | Redis cache; shared rate-limit state before the second instance |
| Growth | ~50 RPS | Event queue, pre-aggregated rollup tables |
| Scale | ~500 RPS | Kafka, ClickHouse cluster with replication, multiple server instances |

### Startup (~5 RPS)

- Add Redis for query caching (5min TTL)
- Move the bot filter's windows to shared state, or put a rate limiter at the edge, before you
  run a second instance (see Known Bottlenecks 2)

### Growth (~50 RPS)

- Server-side event queue (decouple ingestion from storage)
- Pre-aggregated rollup tables (hourly/daily materialized views in ClickHouse)

### Scale (~500 RPS)

- Kafka/Redpanda for event streaming
- ClickHouse cluster with replication
- Multiple server instances behind load balancer

## Quick Wins

If you're seeing slowness:

1. **Redis cache** -- 2 hours, reduces DB load by 90%+ for dashboard
2. **Edge or shared rate limiting** -- 30 minutes, and it is what keeps the bot filter honest once you run more than one instance
3. **Materialized views** -- Pre-aggregate common queries in ClickHouse

## Postgres Adapter

If using Postgres instead of ClickHouse:
- Full feature parity with ClickHouse, every metric and time series produces identical results
- Event ingestion uses chunked multi-row INSERT, sized automatically to stay under PG's 65,535 bind-parameter limit (the exact rows-per-batch is derived from the column count and maintained next to the INSERT itself)
- Properties and traits are stored as native `jsonb`
- Composite index on `(site_id, timestamp DESC)` powers fast range scans
- Sites use a `deleted_at` soft-delete column to mirror ClickHouse semantics
- Comfortable up to 10M+ events on a 2 CPU / 4 GB Postgres instance (Supabase, Neon, Railway PG)
- For larger workloads, partition `litemetrics_events` by month and add a `BRIN` index on `timestamp`

## MongoDB Adapter

If using MongoDB instead of ClickHouse:
- Event ingestion uses `insertMany()` to MongoDB
- Unique counts use `$addToSet` (loads IDs into memory, breaks at ~500K+ uniques)
- Add composite indexes for `top_*` queries: `{ siteId: 1, timestamp: -1, "geo.country": 1 }`
- MongoDB Atlas free tier (512MB) handles ~10 apps with 1K users
- For larger datasets, consider switching to ClickHouse or Postgres adapter
