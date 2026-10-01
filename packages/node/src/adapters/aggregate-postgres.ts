import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import {
  AggregatePageError, FILTER_COLUMNS, METRIC_COLUMNS, SNAPSHOT_BUILD_TIMEOUT, SNAPSHOT_QUOTA,
  SNAPSHOT_ROW_CAP, capacity, safeCount, unavailable,
} from '../aggregate-page.js';
import type { AggregateBackend, AggregateRow, AggregateSnapshot, NormalizedPageParams } from '../aggregate-page.js';

const META = 'litemetrics_aggregate_snapshots';
const ROWS = 'litemetrics_aggregate_snapshot_rows';
const QUOTA = 'litemetrics_aggregate_snapshot_owners';
type SnapshotQuery = (text: string, values?: unknown[]) => Promise<QueryResult>;
const MAINTENANCE_TIMEOUT = 10_000;
const MAX_PENDING_CHECKOUTS = 4;
const MAX_QUEUED_CHECKOUTS = 128;

export class PostgresAggregateBackend implements AggregateBackend {
  private initialization?: Promise<void>;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private cleanupTask?: Promise<void>;
  private closed = false;
  private abortOperations = new Set<() => void>();
  private pendingCheckouts = 0;
  private queuedCheckouts = new Set<() => void>();
  constructor(private pool: Pool, private referrer: () => string, private channel: () => string) {}

  private deadline(s: AggregateSnapshot, requestDeadline?: number): number {
    return Math.min(requestDeadline ?? Infinity, Date.parse(s.createdAt) + SNAPSHOT_BUILD_TIMEOUT);
  }

  /** Dispatch FIFO while bounding unresolved driver callbacks separately from readers. */
  private drainCheckouts(): void {
    while (!this.closed && this.pendingCheckouts < MAX_PENDING_CHECKOUTS) {
      const start = this.queuedCheckouts.values().next().value;
      if (!start) return;
      this.queuedCheckouts.delete(start);
      start();
    }
  }

  /** Own the whole checkout/transaction lease, rather than racing an unowned promise. */
  private transaction<T>(deadline: number, operation: (query: SnapshotQuery) => Promise<T>): Promise<T> {
    if (this.closed || !Number.isFinite(deadline) || deadline <= Date.now() || this.queuedCheckouts.size >= MAX_QUEUED_CHECKOUTS) return Promise.reject(unavailable());
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let client: PoolClient | undefined;
      const finish = (error?: unknown, value?: T, destroy = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.abortOperations.delete(abort);
        this.queuedCheckouts.delete(startCheckout);
        if (client) { try { client.release(destroy); } catch {} }
        if (error) reject(error instanceof AggregatePageError ? error : unavailable());
        else resolve(value as T);
      };
      // pg-pool release(true) closes the active connection. With installed pg,
      // an active query makes Client.end destroy its socket, aborting its transaction.
      const abort = () => finish(unavailable(), undefined, true);
      const timer = setTimeout(abort, Math.max(1, deadline - Date.now()));
      this.abortOperations.add(abort);
      const check = () => { if (settled || this.closed || Date.now() >= deadline) throw unavailable(); };
      const startCheckout = () => {
        if (settled || this.closed || Date.now() >= deadline) { finish(unavailable()); return; }
        this.pendingCheckouts++;
        let checkout: Promise<PoolClient>;
        try { checkout = this.pool.connect(); }
        catch (error) { this.pendingCheckouts--; finish(error); return; }
        void checkout.then(acquired => {
          this.pendingCheckouts--;
          if (settled) { try { acquired.release(); } catch {} this.drainCheckouts(); return; }
          client = acquired;
          this.drainCheckouts();
          const raw: SnapshotQuery = async (text, values) => { check(); return acquired.query(text, values); };
          const query: SnapshotQuery = async (text, values) => {
            check();
            await raw(`SET LOCAL statement_timeout = '${Math.max(1, deadline - Date.now())}ms'`);
            check();
            return raw(text, values);
          };
          void (async () => {
            try {
              await raw('BEGIN');
              await query(`SET LOCAL lock_timeout = '${Math.min(5_000, Math.max(1, deadline - Date.now()))}ms'`);
              const value = await operation(query);
              await query('COMMIT');
              check();
              finish(undefined, value);
            } catch (error) {
              // A live lease rolls back before reuse. Deadline/close destroys it;
              // check prevents a late continuation from issuing any further SQL.
              if (!settled) {
                try { await raw('ROLLBACK'); }
                catch { finish(error, undefined, true); return; }
                finish(error);
              }
            }
          })();
        }, error => { this.pendingCheckouts--; finish(error); this.drainCheckouts(); });
      };
      this.queuedCheckouts.add(startCheckout);
      this.drainCheckouts();
    });
  }

  /** Fresh authorization/existence reads use the same FIFO and owned lease as page SQL. */
  async siteRow<Row extends QueryResultRow>(column: 'site_id' | 'secret_key', value: string,
    deadline = Date.now() + SNAPSHOT_BUILD_TIMEOUT): Promise<Row | null> {
    return this.transaction(Math.min(deadline, Date.now() + SNAPSHOT_BUILD_TIMEOUT), async query => {
      const result = await query(`SELECT * FROM litemetrics_sites WHERE ${column}=$1 AND deleted_at IS NULL`, [value]);
      return (result.rows[0] as Row | undefined) ?? null;
    });
  }

  async ensure(deadline = Date.now() + SNAPSHOT_BUILD_TIMEOUT): Promise<void> {
    deadline = Math.min(deadline, Date.now() + SNAPSHOT_BUILD_TIMEOUT);
    this.initialization ??= (async () => {
      try {
        await this.transaction(deadline, async query => {
          await query(`CREATE TABLE IF NOT EXISTS ${META} (
            id text PRIMARY KEY, site_id text NOT NULL, scope_hash text NOT NULL, state text NOT NULL,
            created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, metadata jsonb NOT NULL)`);
          await query(`CREATE INDEX IF NOT EXISTS litemetrics_aggregate_owner_expiry ON ${META}(site_id,expires_at)`);
          await query(`CREATE TABLE IF NOT EXISTS ${ROWS} (
            snapshot_id text NOT NULL, position bigint NOT NULL, key text NOT NULL, search_key text NOT NULL,
            value bigint NOT NULL, expires_at timestamptz NOT NULL, PRIMARY KEY(snapshot_id,position))`);
          await query(`CREATE INDEX IF NOT EXISTS litemetrics_aggregate_row_expiry ON ${ROWS}(expires_at)`);
          await query(`CREATE TABLE IF NOT EXISTS ${QUOTA}(site_id text PRIMARY KEY)`);
        });
      } catch { throw unavailable(); }
    })();
    try {
      await this.initialization;
      if (!this.closed && !this.cleanupTimer) {
        this.cleanupTimer = setInterval(() => { void this.sweep().catch(() => {}); }, 5_000);
        this.cleanupTimer.unref();
        void this.sweep().catch(() => {});
      }
    } catch (error) { this.initialization = undefined; throw error; }
  }

  /** Expiry runs independently of fresh page traffic and never touches events. */
  private sweep(): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.cleanupTask) return this.cleanupTask;
    const task = this.transaction(Date.now() + MAINTENANCE_TIMEOUT, async query => {
      await query(`WITH expired AS (
        SELECT r.snapshot_id,r.position FROM ${ROWS} r
        WHERE r.expires_at<=now() OR EXISTS (SELECT 1 FROM ${META} m WHERE m.id=r.snapshot_id
          AND (m.state='failed' OR (m.state='building' AND m.created_at<=now()-INTERVAL '60 seconds')))
        ORDER BY r.expires_at,r.snapshot_id,r.position LIMIT 100000 FOR UPDATE OF r SKIP LOCKED)
        DELETE FROM ${ROWS} r USING expired e WHERE r.snapshot_id=e.snapshot_id AND r.position=e.position`);
      await query(`WITH expired AS (SELECT m.id FROM ${META} m
        WHERE (m.expires_at<=now() OR m.state='failed' OR (m.state='building' AND m.created_at<=now()-INTERVAL '60 seconds'))
        AND NOT EXISTS (SELECT 1 FROM ${ROWS} r WHERE r.snapshot_id=m.id)
        ORDER BY m.expires_at LIMIT 128 FOR UPDATE OF m SKIP LOCKED)
        DELETE FROM ${META} m USING expired e WHERE m.id=e.id`);
    });
    this.cleanupTask=task;
    void task.finally(() => { if (this.cleanupTask===task) this.cleanupTask=undefined; }).catch(() => {});
    return task;
  }

  async close(): Promise<void> {
    this.closed=true;
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer=undefined;
    for (const abort of [...this.abortOperations]) abort();
    await this.initialization?.catch(() => {});
    await this.cleanupTask?.catch(() => {});
  }

  async reserve(snapshot: AggregateSnapshot, deadline?: number): Promise<{ snapshot: AggregateSnapshot; owned: boolean }> {
    return this.transaction(this.deadline(snapshot, deadline), async query => {
      await query(`INSERT INTO ${QUOTA}(site_id) VALUES($1) ON CONFLICT DO NOTHING`, [snapshot.siteId]);
      await query(`SELECT site_id FROM ${QUOTA} WHERE site_id=$1 FOR UPDATE`, [snapshot.siteId]);
      const pending = await query(`SELECT metadata FROM ${META}
        WHERE site_id=$1 AND scope_hash=$2 AND state='building' AND expires_at>$3
        AND created_at>$4`, [snapshot.siteId, snapshot.scopeHash, new Date(),new Date(Date.now()-SNAPSHOT_BUILD_TIMEOUT)]);
      if (pending.rows.length) {
        return { snapshot: pending.rows[0]!.metadata, owned: false };
      }
      const count = await query(`SELECT COUNT(*) AS value FROM ${META}
        WHERE site_id=$1 AND expires_at>$2 AND (state='ready' OR (state='building' AND created_at>$3))`,
        [snapshot.siteId, new Date(),new Date(Date.now()-SNAPSHOT_BUILD_TIMEOUT)]);
      if (safeCount(count.rows[0]?.value) >= SNAPSHOT_QUOTA) throw capacity();
      await query(`INSERT INTO ${META}(id,site_id,scope_hash,state,created_at,expires_at,metadata)
        VALUES($1,$2,$3,'building',$4,$5,$6::jsonb)`, [snapshot.id, snapshot.siteId, snapshot.scopeHash, snapshot.createdAt, snapshot.expiresAt, JSON.stringify(snapshot)]);
      return { snapshot, owned: true };
    });
  }

  async materialize(s: AggregateSnapshot, q: NormalizedPageParams, deadline?: number): Promise<{ rowCount: number; valueSum: number }> {
    const values: unknown[] = [];
    const add = (value: unknown) => { values.push(value); return `$${values.length}`; };
    const column = METRIC_COLUMNS[q.metric];
    const key = q.metric === 'top_referrers' ? this.referrer() : column;
    const where = [`site_id=${add(q.siteId)}`, `timestamp>=${add(s.from)}::timestamptz`, `timestamp<=${add(s.to)}::timestamptz`, `${column} IS NOT NULL`];
    if (!q.includeBots) where.push('bot_flag IS NULL');
    const pageviews = q.metric === 'top_pages' || q.metric === 'top_referrers';
    if (pageviews) where.push("type='pageview'");
    if (q.metric === 'top_referrers') where.push("referrer<>''", `${key}<>''`);
    for (const [name, value] of Object.entries(q.filters)) {
      const expression = name === 'referrer' ? this.referrer() : name === 'channel' ? this.channel() : FILTER_COLUMNS[name];
      where.push(`${expression}=${add(value)}`);
    }
    const eligible = [`value>=${add(q.minCount)}`];
    if (q.search) eligible.push(`strpos(search_key,${add(q.search)})>0`);
    if (q.keys !== undefined) eligible.push(`key=ANY(${add(q.keys)}::text[])`);
    const id = add(s.id), expiry = add(s.expiresAt);
    const sql = `INSERT INTO ${ROWS}(snapshot_id,position,key,search_key,value,expires_at)
      SELECT ${id},row_number() OVER (ORDER BY value DESC,key COLLATE "C" ASC),key,search_key,value,${expiry}::timestamptz
      FROM (SELECT * FROM (SELECT ${key} AS key,
        translate(${key},'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') AS search_key,
        ${pageviews ? 'COUNT(*)' : 'COUNT(DISTINCT visitor_id)'}::bigint AS value
        FROM litemetrics_events WHERE ${where.join(' AND ')} GROUP BY ${key}) grouped
        WHERE ${eligible.join(' AND ')} ORDER BY value DESC,key COLLATE "C" ASC LIMIT ${SNAPSHOT_ROW_CAP + 1}) eligible`;
    return this.transaction(this.deadline(s, deadline), async query => {
      await query(sql, values);
      const totals = await query(`SELECT COUNT(*) AS count,COALESCE(SUM(value),0)::text AS sum FROM ${ROWS} WHERE snapshot_id=$1`, [s.id]);
      const rowCount = safeCount(totals.rows[0]?.count), valueSum = safeCount(totals.rows[0]?.sum);
      if (rowCount > SNAPSHOT_ROW_CAP) throw capacity();
      return { rowCount, valueSum };
    });
  }

  async publish(s: AggregateSnapshot, deadline?: number): Promise<void> {
    await this.transaction(this.deadline(s, deadline), async query => {
      const result = await query(`UPDATE ${META} SET state='ready',metadata=$2::jsonb
        WHERE id=$1 AND state='building' AND expires_at>now()`, [s.id, JSON.stringify(s)]);
      if (result.rowCount !== 1) throw new AggregatePageError('snapshot_expired', 409);
    });
  }
  async fail(s: AggregateSnapshot, deadline?: number): Promise<void> {
    if (this.deadline(s, deadline) <= Date.now()) { void this.sweep().catch(() => {}); return; }
    await this.transaction(Math.min(this.deadline(s, deadline), Date.now() + MAINTENANCE_TIMEOUT), async query => {
      await query(`DELETE FROM ${ROWS} WHERE snapshot_id=$1`, [s.id]);
      await query(`DELETE FROM ${META} WHERE id=$1`, [s.id]);
    });
  }
  async get(id: string, _siteId?: string, deadline = Date.now() + SNAPSHOT_BUILD_TIMEOUT): Promise<AggregateSnapshot | null> {
    return this.transaction(deadline, async query => {
      const result = await query(`SELECT metadata FROM ${META} WHERE id=$1`, [id]);
      return result.rows[0]?.metadata ?? null;
    });
  }
  async rows(id: string, boundary: number, direction: 'forward' | 'back', limit: number,
    deadline = Date.now() + SNAPSHOT_BUILD_TIMEOUT): Promise<AggregateRow[]> {
    return this.transaction(Math.min(deadline, Date.now() + SNAPSHOT_BUILD_TIMEOUT), async query => {
      const result = await query(`SELECT position,key,value FROM ${ROWS}
        WHERE snapshot_id=$1 AND position${direction === 'back' ? '<' : '>'}$2
        ORDER BY position ${direction === 'back' ? 'DESC' : 'ASC'} LIMIT $3`, [id, boundary, limit]);
      return result.rows.map((row) => ({ position: safeCount(row.position), key: row.key, value: safeCount(row.value) }));
    });
  }
  async cleanup(_now: number): Promise<void> {
    // Logical expiry and abandoned construction exclusion are enforced by reads
    // and reservation. Physical deletion belongs to the bounded lifecycle task.
    void this.sweep().catch(() => {});
  }
}
