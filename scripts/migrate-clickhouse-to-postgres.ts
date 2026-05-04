/**
 * One-time migration: ClickHouse → Postgres.
 *
 * Reads sites, identity_map, and events from a litemetrics ClickHouse instance
 * and writes them to a Postgres instance using the same schema as PostgresAdapter.init().
 *
 * Usage:
 *   CLICKHOUSE_URL=http://user:pass@host:8123 \
 *   POSTGRES_URL=postgres://user:pass@host:5432/litemetrics \
 *   bun scripts/migrate-clickhouse-to-postgres.ts
 *
 * Optional flags:
 *   --batch-size <N>     events per insert batch (default: 2000)
 *   --since <ISO>        only events with timestamp >= ISO date
 *   --dry-run            count rows but don't insert
 *   --skip-events        migrate sites + identity only
 *   --skip-sites         skip sites
 *   --skip-identity      skip identity map
 *
 * Re-runnable: tables are NOT truncated. Sites/identity use ON CONFLICT DO UPDATE
 * (idempotent). Events insert with explicit event_id (idempotent on PRIMARY KEY).
 */

import { createClient } from '@clickhouse/client';
import { Pool } from 'pg';

interface Args {
  batchSize: number;
  since?: string;
  dryRun: boolean;
  skipEvents: boolean;
  skipSites: boolean;
  skipIdentity: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  // Postgres caps bind parameters per statement at 65,535 (uint16). Events INSERT has
  // 44 columns/row → max safe batch = floor(65535/44) = 1489. Use 1400 with margin.
  const requested = Number(get('--batch-size') ?? 1000);
  const MAX_SAFE = 1400;
  const batchSize = Math.min(requested, MAX_SAFE);
  if (requested > MAX_SAFE) {
    console.warn(`Warning: --batch-size ${requested} exceeds Postgres bind-parameter safety limit; clamped to ${MAX_SAFE}`);
  }
  return {
    batchSize,
    since: get('--since'),
    dryRun: argv.includes('--dry-run'),
    skipEvents: argv.includes('--skip-events'),
    skipSites: argv.includes('--skip-sites'),
    skipIdentity: argv.includes('--skip-identity'),
  };
}

const EVENT_COLUMNS = [
  'event_id', 'site_id', 'type', 'timestamp', 'session_id', 'visitor_id',
  'url', 'referrer', 'title', 'event_name', 'properties',
  'event_source', 'event_subtype', 'page_path', 'target_url_path',
  'element_selector', 'element_text', 'scroll_depth_pct',
  'user_id', 'traits',
  'country', 'city', 'region',
  'device_type', 'browser', 'os', 'language', 'timezone',
  'screen_width', 'screen_height',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ip',
  'os_version', 'device_model', 'device_brand',
  'app_version', 'app_build', 'sdk_name', 'sdk_version',
  'created_at',
];

async function main() {
  const args = parseArgs();
  const chUrl = process.env.CLICKHOUSE_URL;
  const pgUrl = process.env.POSTGRES_URL;

  if (!chUrl || !pgUrl) {
    console.error('Missing CLICKHOUSE_URL or POSTGRES_URL env vars');
    process.exit(1);
  }

  console.log(`ClickHouse → Postgres migration`);
  console.log(`  ClickHouse: ${chUrl.replace(/:[^@/]+@/, ':***@')}`);
  console.log(`  Postgres:   ${pgUrl.replace(/:[^@/]+@/, ':***@')}`);
  console.log(`  Batch:      ${args.batchSize}`);
  if (args.since) console.log(`  Since:      ${args.since}`);
  if (args.dryRun) console.log(`  DRY RUN (no inserts)`);
  console.log();

  const ch = createClient({ url: chUrl });
  const pg = new Pool({ connectionString: pgUrl, max: 5 });

  try {
    if (!args.skipSites) await migrateSites(ch, pg, args);
    if (!args.skipIdentity) await migrateIdentity(ch, pg, args);
    if (!args.skipEvents) await migrateEvents(ch, pg, args);
    console.log('\n✓ Migration complete');
  } finally {
    await ch.close();
    await pg.end();
  }
}

async function migrateSites(ch: ReturnType<typeof createClient>, pg: Pool, args: Args): Promise<void> {
  console.log('→ Migrating sites...');
  const result = await ch.query({
    query: `SELECT site_id, secret_key, name, type, domain, allowed_origins, conversion_events, created_at, updated_at FROM litemetrics_sites FINAL WHERE is_deleted = 0`,
    format: 'JSONEachRow',
  });
  const rows = await result.json<Record<string, unknown>>();
  console.log(`  Found ${rows.length} sites`);
  if (args.dryRun || rows.length === 0) return;

  for (const r of rows) {
    const allowedOrigins = parseJsonArray(r.allowed_origins);
    const conversionEvents = parseJsonArray(r.conversion_events);
    await pg.query(
      `INSERT INTO litemetrics_sites
         (site_id, secret_key, name, type, domain, allowed_origins, conversion_events, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (site_id) DO UPDATE SET
         secret_key = EXCLUDED.secret_key,
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         domain = EXCLUDED.domain,
         allowed_origins = EXCLUDED.allowed_origins,
         conversion_events = EXCLUDED.conversion_events,
         updated_at = EXCLUDED.updated_at`,
      [
        r.site_id,
        r.secret_key,
        r.name,
        r.type ?? 'web',
        r.domain ?? null,
        allowedOrigins,
        conversionEvents,
        new Date(String(r.created_at)),
        new Date(String(r.updated_at)),
      ],
    );
  }
  console.log(`  ✓ ${rows.length} sites migrated`);
}

async function migrateIdentity(ch: ReturnType<typeof createClient>, pg: Pool, args: Args): Promise<void> {
  console.log('→ Migrating identity_map...');
  const result = await ch.query({
    query: `SELECT site_id, visitor_id, user_id, identified_at, created_at FROM litemetrics_identity_map FINAL`,
    format: 'JSONEachRow',
  });
  const rows = await result.json<Record<string, unknown>>();
  console.log(`  Found ${rows.length} identity rows`);
  if (args.dryRun || rows.length === 0) return;

  for (const r of rows) {
    await pg.query(
      `INSERT INTO litemetrics_identity_map (site_id, visitor_id, user_id, identified_at, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (site_id, visitor_id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         identified_at = EXCLUDED.identified_at`,
      [
        r.site_id,
        r.visitor_id,
        r.user_id,
        new Date(String(r.identified_at)),
        new Date(String(r.created_at ?? r.identified_at)),
      ],
    );
  }
  console.log(`  ✓ ${rows.length} identity rows migrated`);
}

async function migrateEvents(ch: ReturnType<typeof createClient>, pg: Pool, args: Args): Promise<void> {
  console.log('→ Migrating events...');

  const sinceClause = args.since ? `WHERE timestamp >= '${args.since.replace(/'/g, "''")}'` : '';
  const countResult = await ch.query({
    query: `SELECT count() AS total FROM litemetrics_events ${sinceClause}`,
    format: 'JSONEachRow',
  });
  const countRows = await countResult.json<{ total: string }>();
  const total = Number(countRows[0]?.total ?? 0);
  console.log(`  Found ${total.toLocaleString()} events`);

  if (args.dryRun || total === 0) return;

  let offset = 0;
  let migrated = 0;
  const startTime = Date.now();

  while (offset < total) {
    const batchResult = await ch.query({
      query: `
        SELECT
          toString(event_id) AS event_id,
          site_id, type, timestamp, session_id, visitor_id,
          url, referrer, title, event_name, properties,
          event_source, event_subtype, page_path, target_url_path,
          element_selector, element_text, scroll_depth_pct,
          user_id, traits,
          country, city, region,
          device_type, browser, os, language, timezone,
          screen_width, screen_height,
          utm_source, utm_medium, utm_campaign, utm_term, utm_content,
          ip,
          os_version, device_model, device_brand,
          app_version, app_build, sdk_name, sdk_version,
          created_at
        FROM litemetrics_events
        ${sinceClause}
        ORDER BY timestamp ASC
        LIMIT ${args.batchSize}
        OFFSET ${offset}
      `,
      format: 'JSONEachRow',
    });
    const rows = await batchResult.json<Record<string, unknown>>();
    if (rows.length === 0) break;

    await insertEventBatch(pg, rows);
    migrated += rows.length;
    offset += rows.length;

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round(migrated / Math.max(elapsed, 0.001));
    const pct = Math.round((migrated / total) * 100);
    process.stdout.write(`\r  ${migrated.toLocaleString()}/${total.toLocaleString()} (${pct}%) — ${rate} rows/s    `);
  }
  console.log(`\n  ✓ ${migrated.toLocaleString()} events migrated in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
}

async function insertEventBatch(pg: Pool, rows: Record<string, unknown>[]): Promise<void> {
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let p = 0;

  for (const r of rows) {
    const row = [
      r.event_id,
      r.site_id,
      r.type,
      new Date(String(r.timestamp)),
      r.session_id,
      r.visitor_id,
      r.url ?? null,
      r.referrer ?? null,
      r.title ?? null,
      r.event_name ?? null,
      normalizeJsonField(r.properties),
      r.event_source ?? null,
      r.event_subtype ?? null,
      r.page_path ?? null,
      r.target_url_path ?? null,
      r.element_selector ?? null,
      r.element_text ?? null,
      coerceInt(r.scroll_depth_pct),
      r.user_id ?? null,
      normalizeJsonField(r.traits),
      r.country ?? null,
      r.city ?? null,
      r.region ?? null,
      r.device_type ?? null,
      r.browser ?? null,
      r.os ?? null,
      r.language ?? null,
      r.timezone ?? null,
      coerceInt(r.screen_width),
      coerceInt(r.screen_height),
      r.utm_source ?? null,
      r.utm_medium ?? null,
      r.utm_campaign ?? null,
      r.utm_term ?? null,
      r.utm_content ?? null,
      r.ip ?? null,
      r.os_version ?? null,
      r.device_model ?? null,
      r.device_brand ?? null,
      r.app_version ?? null,
      r.app_build ?? null,
      r.sdk_name ?? null,
      r.sdk_version ?? null,
      new Date(String(r.created_at ?? r.timestamp)),
    ];
    placeholders.push('(' + row.map(() => `$${++p}`).join(', ') + ')');
    values.push(...row);
  }

  const sql = `INSERT INTO litemetrics_events (${EVENT_COLUMNS.join(', ')}) VALUES ${placeholders.join(', ')} ON CONFLICT (event_id) DO NOTHING`;
  await pg.query(sql, values);
}

/**
 * ClickHouse stores `properties`/`traits` as Nullable(String) JSON. Depending on the
 * client version, JSONEachRow may deliver them as JSON-encoded strings or as parsed
 * objects. Normalize to a JSON string suitable for binding into a Postgres jsonb column.
 */
function normalizeJsonField(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    if (value === '') return null;
    try { JSON.parse(value); return value; } catch { return null; }
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return null;
}

/** Coerce numeric fields that may arrive as strings from JSONEachRow into integers. */
function coerceInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseJsonArray(value: unknown): string[] | null {
  if (!value) return null;
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

main().catch((err) => {
  console.error('\n✗ Migration failed:', err);
  process.exit(1);
});
