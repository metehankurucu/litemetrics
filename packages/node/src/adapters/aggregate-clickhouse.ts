import { createHash } from 'node:crypto';
import type { ClickHouseClient } from '@clickhouse/client';
import { AggregatePageError, FILTER_COLUMNS, METRIC_COLUMNS, SNAPSHOT_BUILD_TIMEOUT, SNAPSHOT_QUOTA,
  SNAPSHOT_ROW_CAP, capacity, safeCount, unavailable } from '../aggregate-page.js';
import type { AggregateBackend, AggregateRow, AggregateSnapshot, NormalizedPageParams } from '../aggregate-page.js';

const OWNERS = 'litemetrics_aggregate_snapshot_owners';
const ROWS = 'litemetrics_aggregate_snapshot_rows';
const settings = { max_execution_time: SNAPSHOT_BUILD_TIMEOUT / 1000, timeout_overflow_mode: 'throw' as const,
  wait_end_of_query: 1 as const, async_insert: 0 as const };
const strict = { ...settings, keeper_map_strict_mode: 1 as const };
interface Owner { revision: number; snapshots: AggregateSnapshot[] }

/** KeeperMap strict mutations are version-checked by Keeper, not a MergeTree counter. */
export class ClickHouseAggregateBackend implements AggregateBackend {
  private initialization?: Promise<void>;
  constructor(private client: ClickHouseClient, private keeperPath: string | undefined,
    private referrer: () => string, private channel: () => string) {}

  private async select<T>(query: string, query_params: Record<string, unknown> = {}): Promise<T[]> {
    const result = await this.client.query({ query, query_params, format: 'JSONEachRow', clickhouse_settings: settings });
    return result.json<T>();
  }

  async ensure(): Promise<void> {
    this.initialization ??= (async () => {
      try {
        if (!this.keeperPath || !/^\/[A-Za-z0-9_/-]{1,512}$/.test(this.keeperPath) || this.keeperPath.includes('//')) throw unavailable();
        const [server] = await this.select<{ version: string }>('SELECT version() AS version');
        const [major, minor] = (server?.version ?? '').split('.').map(Number);
        if (!(major! > 25 || major === 25 && minor! >= 6)) throw unavailable();
        // Unknown/disabled KeeperMap settings fail closed, even when legacy queries work.
        await this.client.command({ query: 'SELECT 1', clickhouse_settings: strict });
        await this.client.command({ query: `CREATE TABLE IF NOT EXISTS ${OWNERS}
          (owner String,revision UInt64,snapshots String) ENGINE=KeeperMap('${this.keeperPath}') PRIMARY KEY owner`, clickhouse_settings: strict });
        const [engine] = await this.select<{ engine_full: string }>(`SELECT engine_full FROM system.tables
          WHERE database=currentDatabase() AND name={name:String}`, { name: OWNERS });
        if (!engine?.engine_full.includes(`'${this.keeperPath}'`)) throw unavailable();
        await this.client.command({ query: `CREATE TABLE IF NOT EXISTS ${ROWS}
          (snapshot_id String,position UInt64,key String,search_key String,value UInt64,expires_at DateTime64(3,'UTC'))
          ENGINE=MergeTree ORDER BY(snapshot_id,position) TTL toDateTime(expires_at)+INTERVAL 1 SECOND DELETE`, clickhouse_settings: settings });
        const [table] = await this.select<{ uuid: string }>(`SELECT toString(uuid) AS uuid FROM system.tables
          WHERE database=currentDatabase() AND name={name:String}`, { name: ROWS });
        if (!table?.uuid || /^0{8}-/.test(table.uuid)) throw unavailable();
        // All service workers must reach the same persisted row table. A shared Keeper
        // with separate local MergeTrees is explicitly unsupported and detected here.
        try {
          await this.client.command({ query: `INSERT INTO ${OWNERS} VALUES({owner:String},0,{snapshots:String})`,
            query_params: { owner: '__row_store__', snapshots: table.uuid }, clickhouse_settings: strict });
        } catch { /* A concurrent worker may have registered this exact table. */ }
        const [identity] = await this.select<{ snapshots: string }>(`SELECT snapshots FROM ${OWNERS} WHERE owner={owner:String}`, { owner: '__row_store__' });
        if (identity?.snapshots !== table.uuid) throw unavailable();
      } catch { throw unavailable(); }
    })();
    try { await this.initialization; } catch (error) { this.initialization = undefined; throw error; }
  }

  private ownerKey(siteId: string): string { return `site:${createHash('sha256').update(siteId).digest('hex')}`; }

  private async owner(siteId: string): Promise<Owner | null> {
    const [row] = await this.select<{ revision: string; snapshots: string }>(`SELECT revision,snapshots FROM ${OWNERS} WHERE owner={owner:String}`, { owner: this.ownerKey(siteId) });
    if (!row) return null;
    try {
      const snapshots = JSON.parse(row.snapshots);
      if (!Array.isArray(snapshots) || snapshots.length > SNAPSHOT_QUOTA || snapshots.some((s: AggregateSnapshot) => s.siteId !== siteId)) throw unavailable();
      return { revision: safeCount(row.revision), snapshots };
    } catch { throw unavailable(); }
  }

  private async initializeOwner(siteId: string): Promise<void> {
    try { await this.client.command({ query: `INSERT INTO ${OWNERS} VALUES({owner:String},0,'[]')`,
      query_params: { owner: this.ownerKey(siteId) }, clickhouse_settings: strict }); }
    catch { if (!await this.owner(siteId)) throw unavailable(); }
  }

  private async cas(siteId: string, before: Owner, snapshots: AggregateSnapshot[]): Promise<void> {
    await this.client.command({ query: `ALTER TABLE ${OWNERS} UPDATE snapshots={snapshots:String},revision=revision+1
      WHERE owner={owner:String} AND revision={revision:UInt64}`,
      query_params: { owner: this.ownerKey(siteId), revision: before.revision, snapshots: JSON.stringify(snapshots) }, clickhouse_settings: strict });
  }

  private alive(snapshots: AggregateSnapshot[], now: number): AggregateSnapshot[] {
    return snapshots.filter((s) => s.state !== 'failed' && Date.parse(s.expiresAt) > now &&
      (s.state !== 'building' || Date.parse(s.createdAt) + SNAPSHOT_BUILD_TIMEOUT > now));
  }

  async reserve(s: AggregateSnapshot): Promise<{ snapshot: AggregateSnapshot; owned: boolean }> {
    await this.initializeOwner(s.siteId);
    const deadline = Date.now() + SNAPSHOT_BUILD_TIMEOUT;
    while (Date.now() < deadline) {
      const before = await this.owner(s.siteId);
      if (!before) throw unavailable();
      const snapshots = this.alive(before.snapshots, Date.now());
      const pending = snapshots.find((item) => item.scopeHash === s.scopeHash && item.state === 'building');
      if (pending) return { snapshot: pending, owned: pending.id === s.id };
      if (snapshots.length >= SNAPSHOT_QUOTA) throw capacity();
      try { await this.cas(s.siteId, before, [...snapshots, s]); } catch { /* Strict CAS conflict: reread. */ }
      const after = await this.owner(s.siteId);
      const reserved = after?.snapshots.find((item) => item.id === s.id);
      if (reserved) return { snapshot: reserved, owned: true };
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw unavailable();
  }

  async materialize(s: AggregateSnapshot, q: NormalizedPageParams): Promise<{ rowCount: number; valueSum: number }> {
    const query_params: Record<string, unknown> = {};
    let count = 0;
    const bind = (value: unknown, type = 'String') => { const name = `p${count++}`; query_params[name] = value; return `{${name}:${type}}`; };
    const column = METRIC_COLUMNS[q.metric], key = q.metric === 'top_referrers' ? this.referrer() : column;
    const pageviews = q.metric === 'top_pages' || q.metric === 'top_referrers';
    const where = [`site_id=${bind(q.siteId)}`, `timestamp>=parseDateTime64BestEffort(${bind(s.from)},3,'UTC')`,
      `timestamp<=parseDateTime64BestEffort(${bind(s.to)},3,'UTC')`, `${column} IS NOT NULL`];
    if (!q.includeBots) where.push('bot_flag IS NULL');
    if (pageviews) where.push("type='pageview'");
    if (q.metric === 'top_referrers') where.push("referrer!=''", `${key}!=''`);
    for (const [name, value] of Object.entries(q.filters)) {
      where.push(`${name === 'referrer' ? this.referrer() : name === 'channel' ? this.channel() : FILTER_COLUMNS[name]}=${bind(value)}`);
    }
    const eligible = [`value>=${bind(q.minCount, 'UInt64')}`];
    if (q.search) eligible.push(`position(search_key,${bind(q.search)})>0`);
    if (q.keys !== undefined) eligible.push(`has(${bind(q.keys, 'Array(String)')},key)`);
    const id = bind(s.id), expires = bind(s.expiresAt);
    try {
      await this.client.command({ query: `INSERT INTO ${ROWS}(snapshot_id,position,key,search_key,value,expires_at)
        SELECT ${id},row_number() OVER(ORDER BY value DESC,key ASC),key,search_key,value,parseDateTime64BestEffort(${expires},3,'UTC')
        FROM (SELECT * FROM (SELECT assumeNotNull(${key}) AS key,lower(key) AS search_key,
          ${pageviews ? 'count()' : 'uniqExact(visitor_id)'} AS value FROM litemetrics_events
          WHERE ${where.join(' AND ')} GROUP BY key) grouped WHERE ${eligible.join(' AND ')}
          ORDER BY value DESC,key ASC LIMIT ${SNAPSHOT_ROW_CAP + 1}) eligible`, query_params, clickhouse_settings: settings });
      const [totals] = await this.select<{ count: string; sum: string }>(`SELECT count() AS count,sum(toUInt128(value)) AS sum FROM ${ROWS} WHERE snapshot_id={id:String}`, { id: s.id });
      const rowCount = safeCount(totals?.count), valueSum = safeCount(totals?.sum);
      if (rowCount > SNAPSHOT_ROW_CAP) throw capacity();
      return { rowCount, valueSum };
    } catch (error) { if (error instanceof AggregatePageError) throw error; throw unavailable(); }
  }

  private async change(s: AggregateSnapshot, remove: boolean): Promise<void> {
    const deadline = Date.now() + SNAPSHOT_BUILD_TIMEOUT;
    while (Date.now() < deadline) {
      const before = await this.owner(s.siteId);
      if (!before) throw new AggregatePageError('snapshot_expired', 409);
      const current = before.snapshots.find((item) => item.id === s.id);
      if (!current) { if (remove) return; throw new AggregatePageError('snapshot_expired', 409); }
      if (!remove && Date.parse(current.expiresAt) <= Date.now()) throw new AggregatePageError('snapshot_expired', 409);
      const snapshots = before.snapshots.flatMap((item) => item.id === s.id ? remove ? [] : [s] : [item]);
      try { await this.cas(s.siteId, before, snapshots); } catch { /* Strict conflict: retry unchanged intent. */ }
      const after = await this.owner(s.siteId);
      const updated = after?.snapshots.find((item) => item.id === s.id);
      if (remove ? !updated : updated?.state === 'ready' && updated.rowCount === s.rowCount && updated.valueSum === s.valueSum) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw unavailable();
  }
  async publish(s: AggregateSnapshot): Promise<void> { await this.change(s, false); }
  async fail(s: AggregateSnapshot): Promise<void> {
    await this.change(s, true);
    await this.client.command({ query: `ALTER TABLE ${ROWS} DELETE WHERE snapshot_id={id:String}`,
      query_params: { id: s.id }, clickhouse_settings: { ...settings, mutations_sync: '1' } });
  }
  async get(id: string, siteId: string): Promise<AggregateSnapshot | null> {
    return (await this.owner(siteId))?.snapshots.find((s) => s.id === id) ?? null;
  }
  async rows(id: string, boundary: number, direction: 'forward' | 'back', limit: number): Promise<AggregateRow[]> {
    const rows = await this.select<{ position: string; key: string; value: string }>(`SELECT position,key,value FROM ${ROWS}
      WHERE snapshot_id={id:String} AND position${direction === 'back' ? '<' : '>'}{boundary:UInt64}
      ORDER BY position ${direction === 'back' ? 'DESC' : 'ASC'} LIMIT {limit:UInt64}`, { id, boundary, limit });
    return rows.map((row) => ({ position: safeCount(row.position), key: row.key, value: safeCount(row.value) }));
  }
  async cleanup(now: number, siteId: string): Promise<void> {
    const deadline = Date.now() + SNAPSHOT_BUILD_TIMEOUT;
    while (Date.now() < deadline) {
      const before = await this.owner(siteId);
      if (!before) return;
      const snapshots = this.alive(before.snapshots, now);
      const expired = before.snapshots.filter((s) => !snapshots.some((item) => item.id === s.id)).map((s) => s.id);
      if (!expired.length) return;
      try { await this.cas(siteId, before, snapshots); } catch { /* Strict conflict. */ }
      const after = await this.owner(siteId);
      if (!after?.snapshots.some((s) => expired.includes(s.id))) {
        await this.client.command({ query: `ALTER TABLE ${ROWS} DELETE WHERE snapshot_id IN {ids:Array(String)}`,
          query_params: { ids: expired }, clickhouse_settings: { ...settings, mutations_sync: '1' } });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw unavailable();
  }
}
