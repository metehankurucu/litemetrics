# Scaling

Current architecture and what to change as traffic grows.

## Current Setup (ClickHouse)

| Component | Implementation |
|-----------|---------------|
| Event ingestion | `POST /api/collect` → batch insert to ClickHouse |
| Query engine | ClickHouse SQL (columnar, analytics-optimized) |
| Unique counts | `uniq()` (HyperLogLog-based) |
| Caching | None |
| Rate limiting | None |
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

### 2. No Rate Limiting

The collect endpoint accepts unlimited requests.

- Fix: Per-IP rate limiting (100 req/min) at Nginx or app level

### 3. Single Server

One Node.js process handles both ingestion and queries.

- Fix: Separate ingestion and query servers, or add load balancer

## Scaling Roadmap

| Scale | Traffic | What to Add |
|-------|---------|-------------|
| Hobby (current) | ~0.5 RPS | Nothing needed |
| Startup | ~5 RPS | Redis cache, rate limiting |
| Growth | ~50 RPS | Event queue, pre-aggregated rollup tables |
| Scale | ~500 RPS | Kafka, ClickHouse cluster with replication, multiple server instances |

### Startup (~5 RPS)

- Add Redis for query caching (5min TTL)
- Add rate limiting

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
2. **Rate limiting** -- 30 minutes, prevents abuse
3. **Materialized views** -- Pre-aggregate common queries in ClickHouse

## MongoDB Adapter

If using MongoDB instead of ClickHouse:
- Event ingestion uses `insertMany()` to MongoDB
- Unique counts use `$addToSet` (loads IDs into memory, breaks at ~500K+ uniques)
- Add composite indexes for `top_*` queries: `{ siteId: 1, timestamp: -1, "geo.country": 1 }`
- MongoDB Atlas free tier (512MB) handles ~10 apps with 1K users
- For larger datasets, consider switching to ClickHouse adapter
