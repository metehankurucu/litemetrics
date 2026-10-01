# Aggregate paging

`GET /api/stats/page` and `collector.queryPage(params)` add persisted aggregate
paging for pages, referrers, countries, operating systems, app versions and
devices. Custom hosts mount `collector.queryPageHandler()`; the
`getStatsPageHandler()` alias returns the same factory handler. The client uses
`getStatsPage(metric, options)` with `pageEndpoint`, defaulting to
`${endpoint}/page`. Existing stats/top-N endpoints and measures are unchanged.

Snapshots live for 600000 ms from creation start. Their ISO time range uses the
existing inclusive LiteMetrics bounds. Rows order by count descending and UTF-8
key bytes ascending; signed version-1 cursors reopen the immutable ordinal
relation. `snapshot` without a cursor returns its root. Authorization and current
site-secret lookup happen for every page. Rotating a site secret invalidates old
cursor signatures. Expired, lost or incomplete snapshot rows return
`409 snapshot_expired`.

Search is a trimmed literal substring (ASCII case insensitive; non-ASCII exact)
of the bucket key. `keys` is an optional exact eligible key set, including an
explicit empty set. `minCount`, search and keys filter the complete aggregate
before materialization and paging. `valueSum` and `denominatorValue` are the same
filtered bucket sum; `share` is a fraction of that sum. Distinct visitors may
belong to several buckets. All three new visitor paths count exactly; the legacy
ClickHouse approximate path remains unchanged.

Creation is single-flight for concurrent identical scopes, with at most two
constructions in one adapter/service instance and 32 active snapshots per site in
shared atomic database metadata. SQL/aggregate operations have a 60000 ms budget.
Materialization retains cap+1 rows to detect the 1000000-row cap. Capacity returns
`429 snapshot_capacity` with `retryAfterMs:5000`. Failed and abandoned metadata
does not remain usable; cleanup removes expired/failed/abandoned records and rows.
No raw-event or full bucket relation is fetched into Node for paging.

## PostgreSQL

The ordinary configured PostgreSQL database stores additive snapshot metadata,
ordinal rows and per-site lock records. The one grouped `INSERT ... SELECT`
captures a statement MVCC source snapshot. Totals are read from the stored rows.
Per-site `FOR UPDATE` serialization protects quota and concurrent reservation.
The DB role needs additive CREATE TABLE/INDEX, SELECT, INSERT, UPDATE and DELETE
permissions. No event column or `EVENT_BASE_COLUMNS` ordering changes are needed.

Aggregate transactions dispatch pool checkouts in FIFO order, with at most four
unresolved driver callbacks and 128 queued operations per backend. Fresh site
existence/current-secret reads for the pager and HTTP page authorization share
this same FIFO and transaction lease; they do not submit legacy `pool.query`
checkouts or use an additional connection budget. Queue waiting
uses the operation's original absolute deadline; it does not add another time
budget. Readers of a shared completed snapshot can queue independently of the
two-construction limit. Excess queued work, deadline expiry and shutdown fail
`503 aggregate_snapshot_unavailable`; queued work is removed on timeout/close,
and a client acquired after its deadline is released without issuing SQL. The
driver's 60-second connection timeout still bounds unresolved late checkouts.

`DBAdapter` additively permits
`getSiteForPage?(siteId:string,deadline?:number):Promise<Site|null>` and
`getSiteBySecretForPage?(secretKey:string,deadline?:number):Promise<Site|null>`.
PostgreSQL implements both with a default absolute epoch-ms deadline captured
before admission (`Date.now()+60000`); an explicit deadline is retained while
waiting and clamped to at most 60000 ms from the call. The pager uses the first
method and the HTTP page handler uses the second before querying a page.
Lookup overload, timeout and shutdown propagate
`503 aggregate_snapshot_unavailable` through the page handler. Every lookup
queries undeleted current site rows, without caching secrets. Other/custom
adapters may omit these methods and retain their existing site lookup behavior.
Legacy site/stat handlers continue to use the original site methods.

`QueryPageOptions` is `{deadline?:number}`. `DBAdapter.queryPage`,
`collector.queryPage` and `PostgresAdapter.queryPage` accept this optional second
argument. It carries a server-side absolute deadline and is never serialized
into HTTP query parameters, filter fingerprints or signed cursors. The HTTP
page handler captures one 60000 ms deadline before authorization; PostgreSQL
uses its remaining budget for current-site reads, schema initialization,
snapshot reservation/construction and snapshot/row reads. The existing
construction deadline can only shrink. Waiting for initialization or a shared
construction also ends at the waiting request's own deadline. Lifecycle
maintenance retains its independently bounded background budget. The overall
request guarantee described here is PostgreSQL-specific; ClickHouse and MongoDB
retain their existing behavior and may ignore the optional internal context.

## MongoDB

MongoDB >=5.3 in a replica set is required. Standalone and unsupported topology
returns `503 aggregate_snapshot_unavailable`. The capability check executes the
write-stage aggregation using `readConcern:{level:'snapshot'}`; there is no
fallback to local/default read concern. The real source pipeline groups at the
database, assigns deterministic ordinals and `$merge`s anonymous rows with
majority write concern. Metadata is published ready only after materialization
and safe totals succeed. A short transaction updating the per-site lock record
serializes metadata reservation. TTL indexes supplement exact read-time expiry.

The deployed server/driver combination must pass the full snapshot-read `$merge`
integration path. A server that rejects that operation fails the capability check
with the named 503. The implementation uses the installed mongodb 6.21.0 driver;
its command operation preserves explicit aggregate read concern outside a
transaction, including write-stage aggregates.

## ClickHouse

The new capability requires ClickHouse >=25.6, an Atomic database, configured
Keeper/ZooKeeper, and KeeperMap with strict mode. Configure the server, for example:

```xml
<clickhouse>
  <zookeeper>
    <node><host>keeper</host><port>9181</port></node>
  </zookeeper>
  <keeper_map_path_prefix>/keeper_map_tables</keeper_map_path_prefix>
</clickhouse>
```

Set `LITEMETRICS_AGGREGATE_KEEPER_PATH=/litemetrics/aggregate/v1` for the bundled
server, or provide the same path in `CollectorConfig.db.aggregateSnapshotKeeperPath`.
Direct adapter users pass
`new ClickHouseAdapter(url,{aggregateSnapshotKeeperPath:'/litemetrics/aggregate/v1'})`.
The root path is relative to the configured KeeperMap prefix. Every service worker
must use the same path and the same persisted ClickHouse row table/database.
The role needs CREATE TABLE, SELECT, INSERT, ALTER UPDATE/DELETE and permission to
set `keeper_map_strict_mode=1`, `async_insert=0`, `wait_end_of_query=1`,
`max_execution_time`, `timeout_overflow_mode` and `mutations_sync`.

Each site has one bounded KeeperMap value containing at most 32 snapshot metadata
records. Strict atomic/version-checked updates perform quota and single-flight
reservation; KeeperMap's soft `keys_limit` is not used as the quota. Count rows
remain in a separate persisted MergeTree relation with TTL. One grouped
`INSERT ... SELECT` uses `uniqExact`, filters the grouped relation, retains cap+1,
and assigns ordinals. Totals use the materialized rows and UInt128 accumulation.

This implementation supports many service instances connected to the **same
ClickHouse row store**. It does not support balancing those requests over
independent local ClickHouse MergeTrees. A Keeper marker stores the row-table
UUID and rejects another store sharing the same coordination path with the named
503. The configured KeeperMap engine path and server version are also checked.
Absent/disabled KeeperMap, missing configuration, schema/permission failure or
unsupported topology returns `503 aggregate_snapshot_unavailable`; legacy stats
can continue. Row-table replacement requires coordinated operation and a new
coordination path after old snapshots expire. Replica/shard deployments need a
separately verified shared-row design before enabling this capability.

## Validation and evidence

Source-only typecheck (excluding `**/*.test.*`) and core/node/client/server builds
passed during implementation. Blind unit/contract tests and real-engine runtime
gates are run separately by the root runner. No actual database integration pass
is claimed here. The PostgreSQL, MongoDB replica and ClickHouse+Keeper gates must
all execute; missing DB variables or skipped suites are not a pass.

Primary evidence used:

- [PostgreSQL 16 statement MVCC](https://www.postgresql.org/docs/16/transaction-iso.html)
- [MongoDB 8.0 setWindowFields snapshot support since 5.3](https://www.mongodb.com/docs/v8.0/reference/operator/aggregation/setWindowFields/)
- [MongoDB snapshot read concern](https://www.mongodb.com/docs/manual/reference/read-concern-snapshot/)
- [MongoDB driver 6.21.0 command/read concern code](https://github.com/mongodb/node-mongodb-native/blob/v6.21.0/src/operations/command.ts)
- [MongoDB driver 6.21.0 write-stage aggregate code](https://github.com/mongodb/node-mongodb-native/blob/v6.21.0/src/operations/aggregate.ts)
- [ClickHouse 25.6 consistent SELECT](https://clickhouse.com/blog/clickhouse-release-25-06)
- [KeeperMap configuration and strict atomic operations](https://clickhouse.com/docs/reference/engines/table-engines/special/keepermap)
- [ClickHouse 25.6.1.3206 KeeperMap version-checked writes and atomic multi](https://github.com/ClickHouse/ClickHouse/blob/v25.6.1.3206-stable/src/Storages/StorageKeeperMap.cpp)
- [Installed ClickHouse client 1.18.4 setting types](https://github.com/ClickHouse/clickhouse-js/blob/1.18.4/packages/client-common/src/settings.ts)
