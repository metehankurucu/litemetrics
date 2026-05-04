import type { DBAdapter, EnrichedEvent, QueryParams, QueryResult, QueryDataPoint, Granularity, TimeSeriesParams, TimeSeriesResult, RetentionParams, RetentionResult, RetentionCohort, Site, CreateSiteRequest, UpdateSiteRequest, EventListParams, EventListResult, EventListItem, UserListParams, UserListResult, UserDetail } from '@litemetrics/core';
import { Pool } from 'pg';
import { resolvePeriod, previousPeriodRange, autoGranularity, granularityToDateFormat, fillBuckets, getISOWeek, generateSiteId, generateSecretKey } from './utils';
import { normalizeReferrer } from '../normalize-referrer.js';
import { isValidTimezone } from '../query-helpers.js';

const EVENTS_TABLE = 'litemetrics_events';
const SITES_TABLE = 'litemetrics_sites';
const IDENTITY_MAP_TABLE = 'litemetrics_identity_map';

// ─── DDL ──────────────────────────────────────────────────────

const CREATE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE} (
    event_id          uuid NOT NULL DEFAULT gen_random_uuid(),
    site_id           text NOT NULL,
    type              text NOT NULL,
    timestamp         timestamptz NOT NULL,
    session_id        text NOT NULL,
    visitor_id        text NOT NULL,
    url               text,
    referrer          text,
    title             text,
    event_name        text,
    properties        jsonb,
    event_source      text,
    event_subtype     text,
    page_path         text,
    target_url_path   text,
    element_selector  text,
    element_text      text,
    scroll_depth_pct  smallint,
    user_id           text,
    traits            jsonb,
    country           text,
    city              text,
    region            text,
    device_type       text,
    browser           text,
    os                text,
    language          text,
    timezone          text,
    screen_width      integer,
    screen_height     integer,
    utm_source        text,
    utm_medium        text,
    utm_campaign      text,
    utm_term          text,
    utm_content       text,
    ip                text,
    os_version        text,
    device_model      text,
    device_brand      text,
    app_version       text,
    app_build         text,
    sdk_name          text,
    sdk_version       text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id)
)
`;

const CREATE_EVENTS_INDEXES: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_${EVENTS_TABLE}_site_ts ON ${EVENTS_TABLE} (site_id, timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_${EVENTS_TABLE}_site_visitor ON ${EVENTS_TABLE} (site_id, visitor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_${EVENTS_TABLE}_site_session ON ${EVENTS_TABLE} (site_id, session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_${EVENTS_TABLE}_site_user ON ${EVENTS_TABLE} (site_id, user_id) WHERE user_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_${EVENTS_TABLE}_site_type_ts ON ${EVENTS_TABLE} (site_id, type, timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_${EVENTS_TABLE}_ts_brin ON ${EVENTS_TABLE} USING BRIN (timestamp)`,
];

const CREATE_SITES_TABLE = `
CREATE TABLE IF NOT EXISTS ${SITES_TABLE} (
    site_id            text PRIMARY KEY,
    secret_key         text NOT NULL,
    name               text NOT NULL,
    type               text DEFAULT 'web',
    domain             text,
    allowed_origins    text[],
    conversion_events  text[],
    created_at         timestamptz NOT NULL,
    updated_at         timestamptz NOT NULL
)
`;

const CREATE_SITES_INDEXES: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_${SITES_TABLE}_secret ON ${SITES_TABLE} (secret_key)`,
];

const CREATE_IDENTITY_MAP_TABLE = `
CREATE TABLE IF NOT EXISTS ${IDENTITY_MAP_TABLE} (
    site_id        text NOT NULL,
    visitor_id     text NOT NULL,
    user_id        text NOT NULL,
    identified_at  timestamptz NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (site_id, visitor_id)
)
`;

const CREATE_IDENTITY_MAP_INDEXES: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_${IDENTITY_MAP_TABLE}_site_user ON ${IDENTITY_MAP_TABLE} (site_id, user_id)`,
];

// ─── Helpers: SQL expressions ──────────────────────────────────

/**
 * Postgres CASE expression that normalizes utm_source abbreviations.
 * Mirrors ClickHouse `normalizedUtmSourceExpr`.
 */
function pgNormalizedUtmSourceExpr(): string {
  return `CASE
    WHEN lower(utm_source) IN ('ig','instagram','instagram.com') THEN 'Instagram'
    WHEN lower(utm_source) IN ('fb','facebook','facebook.com','fb.com') THEN 'Facebook'
    WHEN lower(utm_source) IN ('tw','twitter','twitter.com','x','x.com','t.co') THEN 'X (Twitter)'
    WHEN lower(utm_source) IN ('li','linkedin','linkedin.com') THEN 'LinkedIn'
    WHEN lower(utm_source) IN ('yt','youtube','youtube.com') THEN 'YouTube'
    WHEN lower(utm_source) IN ('goog','google','google.com') THEN 'Google'
    WHEN lower(utm_source) IN ('gh','github','github.com') THEN 'GitHub'
    WHEN lower(utm_source) IN ('reddit','reddit.com') THEN 'Reddit'
    WHEN lower(utm_source) IN ('pinterest','pinterest.com') THEN 'Pinterest'
    WHEN lower(utm_source) IN ('tiktok','tiktok.com') THEN 'TikTok'
    WHEN lower(utm_source) IN ('openai','chatgpt','chat.openai.com') THEN 'OpenAI'
    WHEN lower(utm_source) IN ('perplexity','perplexity.ai') THEN 'Perplexity'
    ELSE utm_source
  END`;
}

/**
 * Postgres expression that normalizes a referrer to bare hostname.
 * Idempotent. Mirrors `normalizeReferrer()` and ClickHouse `normalizedReferrerExpr`.
 * For http(s): lowercase, drop scheme, drop www./m., drop path, drop :port.
 * Non-http schemes pass through lowercased.
 */
export function pgNormalizedReferrerExpr(): string {
  return `CASE
    WHEN lower(referrer) ~ '^https?://' THEN
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(referrer), '^https?://', ''),
            '^(www\\.|m\\.)', ''
          ),
          '/.*$', ''
        ),
        ':[0-9]+$', ''
      )
    ELSE lower(referrer)
  END`;
}

/** Postgres CASE expression that normalizes utm_medium values. */
function pgNormalizedUtmMediumExpr(): string {
  return `CASE
    WHEN lower(utm_medium) IN ('cpc','ppc','paidsearch','paid-search','paid_search','paid') THEN 'Paid'
    WHEN lower(utm_medium) IN ('organic') THEN 'Organic'
    WHEN lower(utm_medium) IN ('social','social-media','social_media') THEN 'Social'
    WHEN lower(utm_medium) IN ('email','e-mail','e_mail') THEN 'Email'
    WHEN lower(utm_medium) IN ('display','banner','cpm') THEN 'Display'
    WHEN lower(utm_medium) IN ('affiliate') THEN 'Affiliate'
    WHEN lower(utm_medium) IN ('referral') THEN 'Referral'
    ELSE utm_medium
  END`;
}

/**
 * Postgres CASE expression for channel classification (Plausible-style).
 * Mirrors ClickHouse `channelClassificationExpr` exactly.
 */
function pgChannelClassificationExpr(): string {
  const SEARCH_REGEX = `(google|bing|yahoo|duckduckgo|ecosia|baidu|yandex|search\\.brave)`;
  const SOCIAL_REGEX = `(instagram|facebook|twitter|x\\.com|t\\.co|linkedin|youtube|tiktok|pinterest|reddit|snapchat|mastodon|tumblr)`;
  const SOCIAL_PAID_REGEX = `(instagram|facebook|twitter|x\\.com|t\\.co|linkedin|youtube|tiktok|pinterest|reddit|snapchat)`;
  return `CASE
    WHEN lower(COALESCE(utm_medium,'')) IN ('cpc','ppc','paidsearch','paid-search','paid_search','paid')
      AND (lower(COALESCE(utm_source,'')) IN ('google','goog','bing','yahoo','duckduckgo','ecosia','baidu','yandex')
           OR COALESCE(referrer,'') ~* '${SEARCH_REGEX}')
      THEN 'Paid Search'
    WHEN lower(COALESCE(utm_medium,'')) IN ('cpc','ppc','paidsearch','paid-search','paid_search','paid')
      AND (lower(COALESCE(utm_source,'')) IN ('instagram','ig','facebook','fb','twitter','tw','x','linkedin','li','youtube','yt','tiktok','pinterest','reddit','snapchat')
           OR COALESCE(referrer,'') ~* '${SOCIAL_PAID_REGEX}')
      THEN 'Paid Social'
    WHEN lower(COALESCE(utm_medium,'')) IN ('email','e-mail','e_mail') THEN 'Email'
    WHEN lower(COALESCE(utm_medium,'')) IN ('display','banner','cpm') THEN 'Display'
    WHEN lower(COALESCE(utm_medium,'')) IN ('affiliate') THEN 'Affiliate'
    WHEN COALESCE(referrer,'') ~* '${SEARCH_REGEX}'
      AND (COALESCE(utm_medium,'') = '' OR lower(utm_medium) NOT IN ('cpc','ppc','paidsearch','paid-search','paid_search','paid'))
      THEN 'Organic Search'
    WHEN (COALESCE(referrer,'') ~* '${SOCIAL_REGEX}'
          OR lower(COALESCE(utm_source,'')) IN ('instagram','ig','facebook','fb','twitter','tw','x','linkedin','li','youtube','yt','tiktok','pinterest','reddit','snapchat'))
      AND (COALESCE(utm_medium,'') = '' OR lower(utm_medium) NOT IN ('cpc','ppc','paidsearch','paid-search','paid_search','paid'))
      THEN 'Organic Social'
    WHEN COALESCE(referrer,'') <> '' THEN 'Referral'
    WHEN COALESCE(utm_source,'') <> '' OR COALESCE(utm_medium,'') <> '' OR COALESCE(utm_campaign,'') <> '' THEN 'Other'
    ELSE 'Direct'
  END`;
}

// ─── Helpers: parameter builder ─────────────────────────────────

/**
 * Numbered placeholder builder for pg queries.
 * Use: `WHERE x = ${p.add(value)}` then call `pool.query(sql, p.values)`.
 */
class PgParams {
  values: unknown[] = [];
  add(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

const FILTER_COLUMN_MAP: Record<string, string> = {
  'geo.country': 'country',
  'geo.city': 'city',
  'geo.region': 'region',
  'language': 'language',
  'device.type': 'device_type',
  'device.browser': 'browser',
  'device.os': 'os',
  'device.osVersion': 'os_version',
  'device.deviceModel': 'device_model',
  'device.deviceBrand': 'device_brand',
  'device.appVersion': 'app_version',
  'utm.source': 'utm_source',
  'utm.medium': 'utm_medium',
  'utm.campaign': 'utm_campaign',
  'utm.term': 'utm_term',
  'utm.content': 'utm_content',
  'referrer': 'referrer',
  'event_source': 'event_source',
  'event_subtype': 'event_subtype',
  'page_path': 'page_path',
  'target_url_path': 'target_url_path',
  'event_name': 'event_name',
  'type': 'type',
};

/**
 * Build filter conditions appended to a WHERE clause.
 * Returns the SQL fragment (with leading ` AND ` if any) and pushes params into `p`.
 */
function buildPgFilterConditions(p: PgParams, filters?: Record<string, string>): string {
  if (!filters) return '';
  const conditions: string[] = [];
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue;
    if (key === 'channel') {
      conditions.push(`${pgChannelClassificationExpr()} = ${p.add(value)}`);
      continue;
    }
    const col = FILTER_COLUMN_MAP[key];
    if (!col) continue;
    if (key === 'referrer') {
      const normalized = normalizeReferrer(value) ?? value.toLowerCase();
      conditions.push(`${pgNormalizedReferrerExpr()} = ${p.add(normalized)}`);
      continue;
    }
    conditions.push(`${col} = ${p.add(value)}`);
  }
  return conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';
}

// ─── Types ─────────────────────────────────────────────────────

interface SiteRow {
  site_id: string;
  secret_key: string;
  name: string;
  type: string | null;
  domain: string | null;
  allowed_origins: string[] | null;
  conversion_events: string[] | null;
  created_at: Date;
  updated_at: Date;
}

// ─── Adapter ───────────────────────────────────────────────────

export class PostgresAdapter implements DBAdapter {
  private pool: Pool;

  constructor(url: string) {
    const max = Number(process.env.LITEMETRICS_PG_POOL_MAX ?? 10);
    this.pool = new Pool({
      connectionString: url,
      max: Number.isFinite(max) && max > 0 ? max : 10,
    });
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // gen_random_uuid() is built-in on PG 13+. On earlier versions it requires pgcrypto.
      // Best-effort: create the extension if we have permission; ignore otherwise.
      try { await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto'); } catch { /* PG 13+ or no permission */ }

      await client.query(CREATE_EVENTS_TABLE);
      for (const sql of CREATE_EVENTS_INDEXES) await client.query(sql);

      await client.query(CREATE_SITES_TABLE);
      for (const sql of CREATE_SITES_INDEXES) await client.query(sql);

      await client.query(CREATE_IDENTITY_MAP_TABLE);
      for (const sql of CREATE_IDENTITY_MAP_INDEXES) await client.query(sql);
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // ─── Event Insertion ──────────────────────────────────────

  async insertEvents(events: EnrichedEvent[]): Promise<void> {
    if (events.length === 0) return;

    const cols = [
      'site_id', 'type', 'timestamp', 'session_id', 'visitor_id',
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
    ];

    const values: unknown[] = [];
    const rowPlaceholders: string[] = [];
    let p = 0;

    for (const e of events) {
      const row = [
        e.siteId,
        e.type,
        new Date(e.timestamp),
        e.sessionId,
        e.visitorId,
        e.url ?? null,
        e.referrer ?? null,
        e.title ?? null,
        e.name ?? null,
        e.properties ? JSON.stringify(e.properties) : null,
        e.eventSource ?? null,
        e.eventSubtype ?? null,
        e.pagePath ?? null,
        e.targetUrlPath ?? null,
        e.elementSelector ?? null,
        e.elementText ?? null,
        e.scrollDepthPct ?? null,
        e.userId ?? null,
        e.traits ? JSON.stringify(e.traits) : null,
        e.geo?.country ?? null,
        e.geo?.city ?? null,
        e.geo?.region ?? null,
        e.device?.type ?? null,
        e.device?.browser ?? null,
        e.device?.os ?? null,
        e.language ?? null,
        e.timezone ?? null,
        e.screen?.width ?? null,
        e.screen?.height ?? null,
        e.utm?.source ?? null,
        e.utm?.medium ?? null,
        e.utm?.campaign ?? null,
        e.utm?.term ?? null,
        e.utm?.content ?? null,
        e.ip ?? null,
        e.device?.osVersion ?? null,
        e.device?.deviceModel ?? null,
        e.device?.deviceBrand ?? null,
        e.device?.appVersion ?? null,
        e.device?.appBuild ?? null,
        e.device?.sdkName ?? null,
        e.device?.sdkVersion ?? null,
      ];
      const placeholders = row.map(() => `$${++p}`).join(', ');
      rowPlaceholders.push(`(${placeholders})`);
      values.push(...row);
    }

    const sql = `INSERT INTO ${EVENTS_TABLE} (${cols.join(', ')}) VALUES ${rowPlaceholders.join(', ')}`;
    await this.pool.query(sql, values);
  }

  // ─── Analytics Queries ─────────────────────────────────────

  async query(q: QueryParams): Promise<QueryResult> {
    const { dateRange, period } = resolvePeriod(q);
    const limit = q.limit ?? 10;

    let data: QueryDataPoint[] = [];
    let total = 0;

    switch (q.metric) {
      case 'pageviews': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND type = 'pageview'`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const r = await this.pool.query<{ value: string }>(
          `SELECT COUNT(*)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql}`,
          p.values,
        );
        total = Number(r.rows[0]?.value ?? 0);
        data = [{ key: 'pageviews', value: total }];
        break;
      }

      case 'visitors': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)}`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const r = await this.pool.query<{ value: string }>(
          `SELECT COUNT(DISTINCT visitor_id)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql}`,
          p.values,
        );
        total = Number(r.rows[0]?.value ?? 0);
        data = [{ key: 'visitors', value: total }];
        break;
      }

      case 'sessions': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)}`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const r = await this.pool.query<{ value: string }>(
          `SELECT COUNT(DISTINCT session_id)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql}`,
          p.values,
        );
        total = Number(r.rows[0]?.value ?? 0);
        data = [{ key: 'sessions', value: total }];
        break;
      }

      case 'events': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND type = 'event'`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const r = await this.pool.query<{ value: string }>(
          `SELECT COUNT(*)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql}`,
          p.values,
        );
        total = Number(r.rows[0]?.value ?? 0);
        data = [{ key: 'events', value: total }];
        break;
      }

      case 'conversions': {
        const conversionEvents = q.conversionEvents ?? [];
        if (conversionEvents.length === 0) {
          data = [{ key: 'conversions', value: 0 }];
          break;
        }
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND type = 'event' AND event_name = ANY(${p.add(conversionEvents)}::text[])`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const r = await this.pool.query<{ value: string }>(
          `SELECT COUNT(*)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql}`,
          p.values,
        );
        total = Number(r.rows[0]?.value ?? 0);
        data = [{ key: 'conversions', value: total }];
        break;
      }

      case 'top_pages': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND type = 'pageview' AND url IS NOT NULL`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const sql = `SELECT url AS key, COUNT(*)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql} GROUP BY url ORDER BY COUNT(*) DESC LIMIT ${p.add(limit)}`;
        const r = await this.pool.query<{ key: string; value: string }>(sql, p.values);
        data = r.rows.map((row) => ({ key: row.key, value: Number(row.value) }));
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_referrers': {
        const p = new PgParams();
        const expr = pgNormalizedReferrerExpr();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND type = 'pageview' AND referrer IS NOT NULL AND referrer <> '' AND ${expr} <> ''`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const sql = `SELECT ${expr} AS key, COUNT(*)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql} GROUP BY key ORDER BY COUNT(*) DESC LIMIT ${p.add(limit)}`;
        const r = await this.pool.query<{ key: string; value: string }>(sql, p.values);
        data = r.rows.map((row) => ({ key: row.key, value: Number(row.value) }));
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_countries': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND country IS NOT NULL`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const sql = `SELECT country AS key, COUNT(DISTINCT visitor_id)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql} GROUP BY country ORDER BY COUNT(DISTINCT visitor_id) DESC LIMIT ${p.add(limit)}`;
        const r = await this.pool.query<{ key: string; value: string }>(sql, p.values);
        data = r.rows.map((row) => ({ key: row.key, value: Number(row.value) }));
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_cities': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND city IS NOT NULL`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const sql = `SELECT city AS key, COUNT(DISTINCT visitor_id)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql} GROUP BY city ORDER BY COUNT(DISTINCT visitor_id) DESC LIMIT ${p.add(limit)}`;
        const r = await this.pool.query<{ key: string; value: string }>(sql, p.values);
        data = r.rows.map((row) => ({ key: row.key, value: Number(row.value) }));
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_events': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND type = 'event' AND event_name IS NOT NULL`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const sql = `SELECT event_name AS key, COUNT(*)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql} GROUP BY event_name ORDER BY COUNT(*) DESC LIMIT ${p.add(limit)}`;
        const r = await this.pool.query<{ key: string; value: string }>(sql, p.values);
        data = r.rows.map((row) => ({ key: row.key, value: Number(row.value) }));
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_conversions': {
        const conversionEvents = q.conversionEvents ?? [];
        if (conversionEvents.length === 0) { data = []; break; }
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND type = 'event' AND event_name = ANY(${p.add(conversionEvents)}::text[])`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const sql = `SELECT event_name AS key, COUNT(*)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql} GROUP BY event_name ORDER BY COUNT(*) DESC LIMIT ${p.add(limit)}`;
        const r = await this.pool.query<{ key: string; value: string }>(sql, p.values);
        data = r.rows.map((row) => ({ key: row.key, value: Number(row.value) }));
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_exit_pages': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND type = 'pageview' AND url IS NOT NULL`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const sql = `
          SELECT exit_url AS key, COUNT(*)::text AS value FROM (
            SELECT session_id, (array_agg(url ORDER BY timestamp DESC))[1] AS exit_url
            FROM ${EVENTS_TABLE}
            WHERE ${where}${filterSql}
            GROUP BY session_id
          ) t
          GROUP BY exit_url
          ORDER BY COUNT(*) DESC
          LIMIT ${p.add(limit)}`;
        const r = await this.pool.query<{ key: string; value: string }>(sql, p.values);
        data = r.rows.map((row) => ({ key: row.key, value: Number(row.value) }));
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_transitions': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND type = 'pageview' AND url IS NOT NULL`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const sql = `
          SELECT (prev_url || ' → ' || curr_url) AS key, COUNT(*)::text AS value FROM (
            SELECT session_id, url AS curr_url,
                   LAG(url, 1) OVER (PARTITION BY session_id ORDER BY timestamp ASC) AS prev_url
            FROM ${EVENTS_TABLE}
            WHERE ${where}${filterSql}
          ) t
          WHERE prev_url IS NOT NULL AND prev_url <> ''
          GROUP BY key
          ORDER BY COUNT(*) DESC
          LIMIT ${p.add(limit)}`;
        const r = await this.pool.query<{ key: string; value: string }>(sql, p.values);
        data = r.rows.map((row) => ({ key: row.key, value: Number(row.value) }));
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_scroll_pages': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND type = 'event' AND event_subtype = 'scroll_depth' AND page_path IS NOT NULL`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const sql = `SELECT page_path AS key, COUNT(*)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql} GROUP BY page_path ORDER BY COUNT(*) DESC LIMIT ${p.add(limit)}`;
        const r = await this.pool.query<{ key: string; value: string }>(sql, p.values);
        data = r.rows.map((row) => ({ key: row.key, value: Number(row.value) }));
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_button_clicks': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND type = 'event' AND event_subtype = 'button_click' AND (element_text IS NOT NULL OR element_selector IS NOT NULL)`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const sql = `SELECT COALESCE(element_text, element_selector) AS key, COUNT(*)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql} GROUP BY key ORDER BY COUNT(*) DESC LIMIT ${p.add(limit)}`;
        const r = await this.pool.query<{ key: string; value: string }>(sql, p.values);
        data = r.rows.map((row) => ({ key: row.key, value: Number(row.value) }));
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_link_targets': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND type = 'event' AND event_subtype IN ('link_click','outbound_click') AND target_url_path IS NOT NULL`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const sql = `SELECT target_url_path AS key, COUNT(*)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql} GROUP BY target_url_path ORDER BY COUNT(*) DESC LIMIT ${p.add(limit)}`;
        const r = await this.pool.query<{ key: string; value: string }>(sql, p.values);
        data = r.rows.map((row) => ({ key: row.key, value: Number(row.value) }));
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_devices': {
        data = await this.simpleTopBy(q, dateRange, limit, 'device_type');
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_browsers': {
        data = await this.simpleTopBy(q, dateRange, limit, 'browser');
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_os': {
        data = await this.simpleTopBy(q, dateRange, limit, 'os');
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_os_versions': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND os IS NOT NULL AND os_version IS NOT NULL`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const sql = `SELECT (os || ' ' || COALESCE(os_version, '')) AS key, COUNT(DISTINCT visitor_id)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql} GROUP BY key ORDER BY COUNT(DISTINCT visitor_id) DESC LIMIT ${p.add(limit)}`;
        const r = await this.pool.query<{ key: string; value: string }>(sql, p.values);
        data = r.rows.map((row) => ({ key: row.key, value: Number(row.value) }));
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_device_models': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND device_model IS NOT NULL`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const sql = `SELECT trim(COALESCE(device_brand, '') || ' ' || device_model) AS key, COUNT(DISTINCT visitor_id)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql} GROUP BY key ORDER BY COUNT(DISTINCT visitor_id) DESC LIMIT ${p.add(limit)}`;
        const r = await this.pool.query<{ key: string; value: string }>(sql, p.values);
        data = r.rows.map((row) => ({ key: row.key, value: Number(row.value) }));
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_app_versions': {
        data = await this.simpleTopBy(q, dateRange, limit, 'app_version');
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_utm_sources': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND utm_source IS NOT NULL AND utm_source <> ''`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const sql = `SELECT ${pgNormalizedUtmSourceExpr()} AS key, COUNT(DISTINCT visitor_id)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql} GROUP BY key ORDER BY COUNT(DISTINCT visitor_id) DESC LIMIT ${p.add(limit)}`;
        const r = await this.pool.query<{ key: string; value: string }>(sql, p.values);
        data = r.rows.map((row) => ({ key: row.key, value: Number(row.value) }));
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_utm_mediums': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND utm_medium IS NOT NULL AND utm_medium <> ''`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const sql = `SELECT ${pgNormalizedUtmMediumExpr()} AS key, COUNT(DISTINCT visitor_id)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql} GROUP BY key ORDER BY COUNT(DISTINCT visitor_id) DESC LIMIT ${p.add(limit)}`;
        const r = await this.pool.query<{ key: string; value: string }>(sql, p.values);
        data = r.rows.map((row) => ({ key: row.key, value: Number(row.value) }));
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_utm_campaigns': {
        data = await this.simpleTopBy(q, dateRange, limit, 'utm_campaign', "utm_campaign IS NOT NULL AND utm_campaign <> ''");
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_utm_terms': {
        data = await this.simpleTopBy(q, dateRange, limit, 'utm_term', "utm_term IS NOT NULL AND utm_term <> ''");
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_utm_contents': {
        data = await this.simpleTopBy(q, dateRange, limit, 'utm_content', "utm_content IS NOT NULL AND utm_content <> ''");
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }

      case 'top_channels': {
        const p = new PgParams();
        const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)}`;
        const filterSql = buildPgFilterConditions(p, q.filters);
        const sql = `SELECT ${pgChannelClassificationExpr()} AS key, COUNT(DISTINCT visitor_id)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql} GROUP BY key ORDER BY COUNT(DISTINCT visitor_id) DESC LIMIT ${p.add(limit)}`;
        const r = await this.pool.query<{ key: string; value: string }>(sql, p.values);
        data = r.rows.map((row) => ({ key: row.key, value: Number(row.value) }));
        total = data.reduce((s, d) => s + d.value, 0);
        break;
      }
    }

    const result: QueryResult = { metric: q.metric, period, data, total };

    if (q.compare && ['pageviews', 'visitors', 'sessions', 'events', 'conversions'].includes(q.metric)) {
      const prevRange = previousPeriodRange(dateRange);
      const prevResult = await this.query({
        ...q,
        compare: false,
        period: 'custom',
        dateFrom: prevRange.from,
        dateTo: prevRange.to,
      });
      result.previousTotal = prevResult.total;
      if (prevResult.total > 0) {
        result.changePercent = Math.round(((total - prevResult.total) / prevResult.total) * 1000) / 10;
      } else if (total > 0) {
        result.changePercent = 100;
      } else {
        result.changePercent = 0;
      }
    }

    return result;
  }

  /**
   * Generic helper for simple `SELECT col AS key, COUNT(DISTINCT visitor_id) AS value`
   * top-N queries. Used by metrics that don't need expression-based keys.
   */
  private async simpleTopBy(
    q: QueryParams,
    dateRange: { from: string; to: string },
    limit: number,
    column: string,
    extraCondition?: string,
  ): Promise<QueryDataPoint[]> {
    const p = new PgParams();
    const baseCondition = extraCondition ?? `${column} IS NOT NULL`;
    const where = `site_id = ${p.add(q.siteId)} AND timestamp >= ${p.add(dateRange.from)} AND timestamp <= ${p.add(dateRange.to)} AND ${baseCondition}`;
    const filterSql = buildPgFilterConditions(p, q.filters);
    const sql = `SELECT ${column} AS key, COUNT(DISTINCT visitor_id)::text AS value FROM ${EVENTS_TABLE} WHERE ${where}${filterSql} GROUP BY ${column} ORDER BY COUNT(DISTINCT visitor_id) DESC LIMIT ${p.add(limit)}`;
    const r = await this.pool.query<{ key: string; value: string }>(sql, p.values);
    return r.rows.map((row) => ({ key: row.key, value: Number(row.value) }));
  }

  // ─── Time Series ──────────────────────────────────────

  async queryTimeSeries(params: TimeSeriesParams): Promise<TimeSeriesResult> {
    const { dateRange, period } = resolvePeriod({
      period: params.period,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    });

    const granularity = params.granularity ?? autoGranularity(period);
    const bucketExpr = this.pgBucketExpr(granularity, params.timezone);
    const dateFormat = granularityToDateFormat(granularity);

    const p = new PgParams();
    const conditions: string[] = [
      `site_id = ${p.add(params.siteId)}`,
      `timestamp >= ${p.add(dateRange.from)}`,
      `timestamp <= ${p.add(dateRange.to)}`,
    ];

    if (params.metric === 'pageviews') {
      conditions.push(`type = 'pageview'`);
    } else if (params.metric === 'events') {
      conditions.push(`type = 'event'`);
    } else if (params.metric === 'conversions') {
      const eventNames = params.conversionEvents ?? [];
      conditions.push(`type = 'event'`);
      conditions.push(`event_name = ANY(${p.add(eventNames)}::text[])`);
    }

    const filterSql = buildPgFilterConditions(p, params.filters);
    const baseWhere = conditions.join(' AND ') + filterSql;

    let aggExpr: string;
    if (params.metric === 'visitors') aggExpr = 'COUNT(DISTINCT visitor_id)';
    else if (params.metric === 'sessions') aggExpr = 'COUNT(DISTINCT session_id)';
    else aggExpr = 'COUNT(*)';

    const sql = `
      SELECT ${bucketExpr} AS bucket, ${aggExpr}::text AS value
      FROM ${EVENTS_TABLE}
      WHERE ${baseWhere}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;

    const r = await this.pool.query<{ bucket: Date; value: string }>(sql, p.values);

    const mappedRows = r.rows.map((row) => ({
      _id: this.formatBucket(row.bucket, granularity),
      value: Number(row.value),
    }));

    const data = fillBuckets(
      new Date(dateRange.from),
      new Date(dateRange.to),
      granularity,
      dateFormat,
      mappedRows,
      params.timezone,
    );

    return { metric: params.metric, granularity, data };
  }

  /**
   * Postgres expression: bucket timestamp by granularity (timezone-aware).
   *
   * Returns a naive `timestamp` (no tz) holding the wall-clock instant in the target tz.
   * The pg driver decodes naive timestamps to JS Date as if UTC, so `getUTCHours()` etc.
   * on the result yields wall-clock components — matching `fillBuckets`/`getISOWeek` which
   * expect that representation. Mirrors ClickHouse's `toStartOfHour(ts, tz)` semantics
   * (wall-clock as naive DateTime).
   */
  private pgBucketExpr(g: Granularity, timezone?: string): string {
    const safeTz = timezone && isValidTimezone(timezone) ? timezone : null;
    const part = g === 'hour' ? 'hour' : g === 'day' ? 'day' : g === 'week' ? 'week' : 'month';
    if (safeTz) {
      const tz = safeTz.replace(/'/g, "''");
      return `date_trunc('${part}', timestamp AT TIME ZONE '${tz}')`;
    }
    return `date_trunc('${part}', timestamp)`;
  }

  /** Format a Postgres-returned bucket Date into the bucket key format used by fillBuckets. */
  private formatBucket(bucket: Date, granularity: Granularity): string {
    const date = bucket instanceof Date ? bucket : new Date(bucket);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');

    switch (granularity) {
      case 'hour': return `${y}-${m}-${d}T${h}:00`;
      case 'day': return `${y}-${m}-${d}`;
      case 'week': return getISOWeek(date);
      case 'month': return `${y}-${m}`;
    }
  }

  // ─── Retention ──────────────────────────────────────

  async queryRetention(params: RetentionParams): Promise<RetentionResult> {
    const weeks = params.weeks ?? 8;
    const now = new Date();
    const startDate = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);

    const r = await this.pool.query<{
      visitor_id: string;
      first_event: Date;
      active_weeks: Date[];
    }>(
      `SELECT
         visitor_id,
         MIN(timestamp) AS first_event,
         array_agg(DISTINCT date_trunc('week', timestamp)) AS active_weeks
       FROM ${EVENTS_TABLE}
       WHERE site_id = $1 AND timestamp >= $2
       GROUP BY visitor_id`,
      [params.siteId, startDate],
    );

    const cohortMap = new Map<string, { visitors: Set<string>; weekSets: Map<string, Set<string>> }>();

    for (const v of r.rows) {
      const firstDate = v.first_event instanceof Date ? v.first_event : new Date(v.first_event);
      const cohortWeek = getISOWeek(firstDate);
      if (!cohortMap.has(cohortWeek)) {
        cohortMap.set(cohortWeek, { visitors: new Set(), weekSets: new Map() });
      }
      const cohort = cohortMap.get(cohortWeek)!;
      cohort.visitors.add(v.visitor_id);

      const eventWeeks = (Array.isArray(v.active_weeks) ? v.active_weeks : []).map((w) => {
        const d = w instanceof Date ? w : new Date(w);
        return getISOWeek(d);
      });

      for (const w of eventWeeks) {
        if (!cohort.weekSets.has(w)) cohort.weekSets.set(w, new Set());
        cohort.weekSets.get(w)!.add(v.visitor_id);
      }
    }

    const sortedWeeks = Array.from(cohortMap.keys()).sort();
    const cohorts: RetentionCohort[] = sortedWeeks.map((week) => {
      const cohort = cohortMap.get(week)!;
      const size = cohort.visitors.size;

      const retention: number[] = [];
      const weekIndex = sortedWeeks.indexOf(week);
      for (let i = 0; i < weeks && (weekIndex + i) < sortedWeeks.length; i++) {
        const targetWeek = sortedWeeks[weekIndex + i];
        const returnedCount = cohort.weekSets.get(targetWeek)?.size ?? 0;
        retention.push(size > 0 ? Math.round((returnedCount / size) * 1000) / 10 : 0);
      }

      return { week, size, retention };
    });

    return { cohorts };
  }

  // ─── Event Listing ──────────────────────────────────────

  async listEvents(params: EventListParams): Promise<EventListResult> {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;

    const p = new PgParams();
    const conditions: string[] = [`site_id = ${p.add(params.siteId)}`];

    if (params.type) conditions.push(`type = ${p.add(params.type)}`);
    if (params.eventName) conditions.push(`event_name = ${p.add(params.eventName)}`);
    if (params.eventSource) conditions.push(`event_source = ${p.add(params.eventSource)}`);
    if (params.eventNames && params.eventNames.length > 0) {
      conditions.push(`event_name = ANY(${p.add(params.eventNames)}::text[])`);
    }
    if (params.visitorId) conditions.push(`visitor_id = ${p.add(params.visitorId)}`);
    if (params.userId) conditions.push(`user_id = ${p.add(params.userId)}`);

    if (params.period || params.dateFrom) {
      const { dateRange } = resolvePeriod({
        period: params.period,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
      });
      conditions.push(`timestamp >= ${p.add(dateRange.from)}`);
      conditions.push(`timestamp <= ${p.add(dateRange.to)}`);
    }

    const where = conditions.join(' AND ');
    // Count uses only the WHERE params; events also adds LIMIT/OFFSET. Snapshot before adding.
    const countValues = [...p.values];
    const limitPlaceholder = p.add(limit);
    const offsetPlaceholder = p.add(offset);

    const eventsSql = `
      SELECT event_id, type, timestamp, session_id, visitor_id, url, referrer, title,
             event_name, properties, event_source, event_subtype, page_path, target_url_path,
             element_selector, element_text, scroll_depth_pct,
             user_id, traits, country, city, region,
             device_type, browser, os, language,
             utm_source, utm_medium, utm_campaign, utm_term, utm_content
      FROM ${EVENTS_TABLE}
      WHERE ${where}
      ORDER BY timestamp DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;
    const countSql = `SELECT COUNT(*)::text AS total FROM ${EVENTS_TABLE} WHERE ${where}`;

    const [eventsResult, countResult] = await Promise.all([
      this.pool.query<Record<string, unknown>>(eventsSql, p.values),
      this.pool.query<{ total: string }>(countSql, countValues),
    ]);

    return {
      events: eventsResult.rows.map((e) => this.toEventListItem(e)),
      total: Number(countResult.rows[0]?.total ?? 0),
      limit,
      offset,
    };
  }

  // ─── User Listing ──────────────────────────────────────

  async listUsers(params: UserListParams): Promise<UserListResult> {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;

    const p = new PgParams();
    const siteIdParam = p.add(params.siteId);
    let searchCondition = '';
    if (params.search) {
      const searchParam = p.add(`%${params.search}%`);
      searchCondition = ` AND (e.visitor_id ILIKE ${searchParam} OR i.user_id ILIKE ${searchParam})`;
    }
    // Count uses only siteId+search params; users adds LIMIT/OFFSET. Snapshot first.
    const countValues = [...p.values];
    const limitParam = p.add(limit);
    const offsetParam = p.add(offset);

    const baseCte = `
      WITH identity AS (
        SELECT visitor_id, user_id
        FROM ${IDENTITY_MAP_TABLE}
        WHERE site_id = ${siteIdParam}
      )
    `;

    const groupKey = `CASE WHEN i.user_id IS NOT NULL AND i.user_id <> '' THEN i.user_id ELSE e.visitor_id END`;

    const usersSql = `
      ${baseCte}
      SELECT
        ${groupKey} AS group_key,
        (array_agg(e.visitor_id ORDER BY e.timestamp DESC))[1] AS visitor_id,
        (array_agg(i.user_id ORDER BY e.timestamp DESC))[1] AS user_id_out,
        (array_agg(e.traits ORDER BY e.timestamp DESC) FILTER (WHERE e.traits IS NOT NULL))[1] AS traits,
        MIN(e.timestamp) AS first_seen,
        MAX(e.timestamp) AS last_seen,
        COUNT(*) AS total_events,
        COUNT(*) FILTER (WHERE e.type = 'pageview') AS total_pageviews,
        COUNT(DISTINCT e.session_id) AS total_sessions,
        (array_agg(e.url ORDER BY e.timestamp DESC) FILTER (WHERE e.url IS NOT NULL))[1] AS last_url,
        (array_agg(e.referrer ORDER BY e.timestamp DESC) FILTER (WHERE e.referrer IS NOT NULL))[1] AS referrer,
        (array_agg(e.device_type ORDER BY e.timestamp DESC) FILTER (WHERE e.device_type IS NOT NULL))[1] AS device_type,
        (array_agg(e.browser ORDER BY e.timestamp DESC) FILTER (WHERE e.browser IS NOT NULL))[1] AS browser,
        (array_agg(e.os ORDER BY e.timestamp DESC) FILTER (WHERE e.os IS NOT NULL))[1] AS os,
        (array_agg(e.country ORDER BY e.timestamp DESC) FILTER (WHERE e.country IS NOT NULL))[1] AS country,
        (array_agg(e.city ORDER BY e.timestamp DESC) FILTER (WHERE e.city IS NOT NULL))[1] AS city,
        (array_agg(e.region ORDER BY e.timestamp DESC) FILTER (WHERE e.region IS NOT NULL))[1] AS region,
        (array_agg(e.language ORDER BY e.timestamp DESC) FILTER (WHERE e.language IS NOT NULL))[1] AS language,
        (array_agg(e.timezone ORDER BY e.timestamp DESC) FILTER (WHERE e.timezone IS NOT NULL))[1] AS timezone,
        (array_agg(e.screen_width ORDER BY e.timestamp DESC) FILTER (WHERE e.screen_width IS NOT NULL))[1] AS screen_width,
        (array_agg(e.screen_height ORDER BY e.timestamp DESC) FILTER (WHERE e.screen_height IS NOT NULL))[1] AS screen_height,
        (array_agg(e.utm_source ORDER BY e.timestamp DESC) FILTER (WHERE e.utm_source IS NOT NULL))[1] AS utm_source,
        (array_agg(e.utm_medium ORDER BY e.timestamp DESC) FILTER (WHERE e.utm_medium IS NOT NULL))[1] AS utm_medium,
        (array_agg(e.utm_campaign ORDER BY e.timestamp DESC) FILTER (WHERE e.utm_campaign IS NOT NULL))[1] AS utm_campaign,
        (array_agg(e.utm_term ORDER BY e.timestamp DESC) FILTER (WHERE e.utm_term IS NOT NULL))[1] AS utm_term,
        (array_agg(e.utm_content ORDER BY e.timestamp DESC) FILTER (WHERE e.utm_content IS NOT NULL))[1] AS utm_content
      FROM ${EVENTS_TABLE} e
      LEFT JOIN identity i ON e.visitor_id = i.visitor_id
      WHERE e.site_id = ${siteIdParam}${searchCondition}
      GROUP BY group_key
      ORDER BY last_seen DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const countSql = `
      ${baseCte}
      SELECT COUNT(*)::text AS total FROM (
        SELECT ${groupKey} AS group_key
        FROM ${EVENTS_TABLE} e
        LEFT JOIN identity i ON e.visitor_id = i.visitor_id
        WHERE e.site_id = ${siteIdParam}${searchCondition}
        GROUP BY group_key
      ) t
    `;

    const [usersResult, countResult] = await Promise.all([
      this.pool.query<Record<string, unknown>>(usersSql, p.values),
      this.pool.query<{ total: string }>(countSql, countValues),
    ]);

    const users: UserDetail[] = usersResult.rows.map((u) => this.rowToUserDetail(u));

    return {
      users,
      total: Number(countResult.rows[0]?.total ?? 0),
      limit,
      offset,
    };
  }

  async getUserDetail(siteId: string, identifier: string): Promise<UserDetail | null> {
    const visitorIds = await this.getVisitorIdsForUser(siteId, identifier);
    if (visitorIds.length > 0) {
      return this.getMergedUserDetail(siteId, identifier, visitorIds);
    }
    const userId = await this.getUserIdForVisitor(siteId, identifier);
    if (userId) {
      const allVisitorIds = await this.getVisitorIdsForUser(siteId, userId);
      return this.getMergedUserDetail(siteId, userId, allVisitorIds.length > 0 ? allVisitorIds : [identifier]);
    }
    const result = await this.listUsers({ siteId, search: identifier, limit: 1 });
    const user = result.users.find((u) => u.visitorId === identifier);
    return user ?? null;
  }

  async getUserEvents(siteId: string, identifier: string, params: EventListParams): Promise<EventListResult> {
    const visitorIds = await this.getVisitorIdsForUser(siteId, identifier);
    if (visitorIds.length > 0) {
      return this.listEventsForVisitorIds(siteId, visitorIds, params);
    }
    const userId = await this.getUserIdForVisitor(siteId, identifier);
    if (userId) {
      const allVisitorIds = await this.getVisitorIdsForUser(siteId, userId);
      if (allVisitorIds.length > 0) {
        return this.listEventsForVisitorIds(siteId, allVisitorIds, params);
      }
    }
    return this.listEvents({ ...params, siteId, visitorId: identifier });
  }

  private async getMergedUserDetail(siteId: string, userId: string, visitorIds: string[]): Promise<UserDetail | null> {
    const r = await this.pool.query<Record<string, unknown>>(
      `SELECT
         (array_agg(visitor_id ORDER BY timestamp DESC))[1] AS visitor_id,
         (array_agg(traits ORDER BY timestamp DESC) FILTER (WHERE traits IS NOT NULL))[1] AS traits,
         MIN(timestamp) AS first_seen,
         MAX(timestamp) AS last_seen,
         COUNT(*) AS total_events,
         COUNT(*) FILTER (WHERE type = 'pageview') AS total_pageviews,
         COUNT(DISTINCT session_id) AS total_sessions,
         (array_agg(url ORDER BY timestamp DESC) FILTER (WHERE url IS NOT NULL))[1] AS last_url,
         (array_agg(referrer ORDER BY timestamp DESC) FILTER (WHERE referrer IS NOT NULL))[1] AS referrer,
         (array_agg(device_type ORDER BY timestamp DESC) FILTER (WHERE device_type IS NOT NULL))[1] AS device_type,
         (array_agg(browser ORDER BY timestamp DESC) FILTER (WHERE browser IS NOT NULL))[1] AS browser,
         (array_agg(os ORDER BY timestamp DESC) FILTER (WHERE os IS NOT NULL))[1] AS os,
         (array_agg(country ORDER BY timestamp DESC) FILTER (WHERE country IS NOT NULL))[1] AS country,
         (array_agg(city ORDER BY timestamp DESC) FILTER (WHERE city IS NOT NULL))[1] AS city,
         (array_agg(region ORDER BY timestamp DESC) FILTER (WHERE region IS NOT NULL))[1] AS region,
         (array_agg(language ORDER BY timestamp DESC) FILTER (WHERE language IS NOT NULL))[1] AS language,
         (array_agg(timezone ORDER BY timestamp DESC) FILTER (WHERE timezone IS NOT NULL))[1] AS timezone,
         (array_agg(screen_width ORDER BY timestamp DESC) FILTER (WHERE screen_width IS NOT NULL))[1] AS screen_width,
         (array_agg(screen_height ORDER BY timestamp DESC) FILTER (WHERE screen_height IS NOT NULL))[1] AS screen_height,
         (array_agg(utm_source ORDER BY timestamp DESC) FILTER (WHERE utm_source IS NOT NULL))[1] AS utm_source,
         (array_agg(utm_medium ORDER BY timestamp DESC) FILTER (WHERE utm_medium IS NOT NULL))[1] AS utm_medium,
         (array_agg(utm_campaign ORDER BY timestamp DESC) FILTER (WHERE utm_campaign IS NOT NULL))[1] AS utm_campaign,
         (array_agg(utm_term ORDER BY timestamp DESC) FILTER (WHERE utm_term IS NOT NULL))[1] AS utm_term,
         (array_agg(utm_content ORDER BY timestamp DESC) FILTER (WHERE utm_content IS NOT NULL))[1] AS utm_content
       FROM ${EVENTS_TABLE}
       WHERE site_id = $1 AND visitor_id = ANY($2::text[])`,
      [siteId, visitorIds],
    );
    if (r.rows.length === 0 || r.rows[0].first_seen === null) return null;
    const detail = this.rowToUserDetail(r.rows[0]);
    detail.userId = userId;
    detail.visitorIds = visitorIds;
    return detail;
  }

  private async listEventsForVisitorIds(siteId: string, visitorIds: string[], params: EventListParams): Promise<EventListResult> {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;

    const p = new PgParams();
    const conditions: string[] = [
      `site_id = ${p.add(siteId)}`,
      `visitor_id = ANY(${p.add(visitorIds)}::text[])`,
    ];

    if (params.type) conditions.push(`type = ${p.add(params.type)}`);
    if (params.eventName) conditions.push(`event_name = ${p.add(params.eventName)}`);
    if (params.eventNames && params.eventNames.length > 0) {
      conditions.push(`event_name = ANY(${p.add(params.eventNames)}::text[])`);
    }
    if (params.period || params.dateFrom) {
      const { dateRange } = resolvePeriod({
        period: params.period,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
      });
      conditions.push(`timestamp >= ${p.add(dateRange.from)}`);
      conditions.push(`timestamp <= ${p.add(dateRange.to)}`);
    }

    const where = conditions.join(' AND ');
    const countValues = [...p.values];
    const limitParam = p.add(limit);
    const offsetParam = p.add(offset);

    const eventsSql = `
      SELECT event_id, type, timestamp, session_id, visitor_id, url, referrer, title,
             event_name, properties, event_source, event_subtype, page_path, target_url_path,
             element_selector, element_text, scroll_depth_pct,
             user_id, traits, country, city, region,
             device_type, browser, os, language,
             utm_source, utm_medium, utm_campaign, utm_term, utm_content
      FROM ${EVENTS_TABLE}
      WHERE ${where}
      ORDER BY timestamp DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;
    const countSql = `SELECT COUNT(*)::text AS total FROM ${EVENTS_TABLE} WHERE ${where}`;

    const [eventsResult, countResult] = await Promise.all([
      this.pool.query<Record<string, unknown>>(eventsSql, p.values),
      this.pool.query<{ total: string }>(countSql, countValues),
    ]);

    return {
      events: eventsResult.rows.map((e) => this.toEventListItem(e)),
      total: Number(countResult.rows[0]?.total ?? 0),
      limit,
      offset,
    };
  }

  // ─── Identity Mapping ──────────────────────────────────────

  async upsertIdentity(siteId: string, visitorId: string, userId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${IDENTITY_MAP_TABLE} (site_id, visitor_id, user_id, identified_at, created_at)
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (site_id, visitor_id)
       DO UPDATE SET user_id = EXCLUDED.user_id, identified_at = EXCLUDED.identified_at`,
      [siteId, visitorId, userId],
    );
  }

  async getVisitorIdsForUser(siteId: string, userId: string): Promise<string[]> {
    const result = await this.pool.query<{ visitor_id: string }>(
      `SELECT visitor_id FROM ${IDENTITY_MAP_TABLE} WHERE site_id = $1 AND user_id = $2`,
      [siteId, userId],
    );
    return result.rows.map((r) => r.visitor_id);
  }

  async getUserIdForVisitor(siteId: string, visitorId: string): Promise<string | null> {
    const result = await this.pool.query<{ user_id: string }>(
      `SELECT user_id FROM ${IDENTITY_MAP_TABLE} WHERE site_id = $1 AND visitor_id = $2 LIMIT 1`,
      [siteId, visitorId],
    );
    return result.rows[0]?.user_id ?? null;
  }

  // ─── Site Management ──────────────────────────────────────

  async createSite(data: CreateSiteRequest): Promise<Site> {
    const now = new Date();
    const siteId = generateSiteId();
    const secretKey = generateSecretKey();
    const allowedOrigins = data.allowedOrigins && data.allowedOrigins.length > 0 ? data.allowedOrigins : null;
    const conversionEvents = data.conversionEvents && data.conversionEvents.length > 0 ? data.conversionEvents : null;

    await this.pool.query(
      `INSERT INTO ${SITES_TABLE} (site_id, secret_key, name, type, domain, allowed_origins, conversion_events, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [siteId, secretKey, data.name, data.type ?? 'web', data.domain ?? null, allowedOrigins, conversionEvents, now, now],
    );

    return {
      siteId,
      secretKey,
      name: data.name,
      type: data.type ?? 'web',
      domain: data.domain ?? undefined,
      allowedOrigins: data.allowedOrigins ?? undefined,
      conversionEvents: data.conversionEvents ?? undefined,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  async getSite(siteId: string): Promise<Site | null> {
    const result = await this.pool.query<SiteRow>(
      `SELECT * FROM ${SITES_TABLE} WHERE site_id = $1`,
      [siteId],
    );
    const row = result.rows[0];
    return row ? this.toSite(row) : null;
  }

  async getSiteBySecret(secretKey: string): Promise<Site | null> {
    const result = await this.pool.query<SiteRow>(
      `SELECT * FROM ${SITES_TABLE} WHERE secret_key = $1`,
      [secretKey],
    );
    const row = result.rows[0];
    return row ? this.toSite(row) : null;
  }

  async listSites(): Promise<Site[]> {
    const result = await this.pool.query<SiteRow>(
      `SELECT * FROM ${SITES_TABLE} ORDER BY created_at DESC`,
    );
    return result.rows.map((r) => this.toSite(r));
  }

  async updateSite(siteId: string, data: UpdateSiteRequest): Promise<Site | null> {
    const sets: string[] = ['updated_at = now()'];
    const values: unknown[] = [];
    let p = 0;

    if (data.name !== undefined) { sets.push(`name = $${++p}`); values.push(data.name); }
    if (data.type !== undefined) { sets.push(`type = $${++p}`); values.push(data.type); }
    if (data.domain !== undefined) { sets.push(`domain = $${++p}`); values.push(data.domain || null); }
    if (data.allowedOrigins !== undefined) {
      sets.push(`allowed_origins = $${++p}`);
      values.push(data.allowedOrigins.length > 0 ? data.allowedOrigins : null);
    }
    if (data.conversionEvents !== undefined) {
      sets.push(`conversion_events = $${++p}`);
      values.push(data.conversionEvents.length > 0 ? data.conversionEvents : null);
    }

    values.push(siteId);
    const result = await this.pool.query<SiteRow>(
      `UPDATE ${SITES_TABLE} SET ${sets.join(', ')} WHERE site_id = $${++p} RETURNING *`,
      values,
    );
    const row = result.rows[0];
    return row ? this.toSite(row) : null;
  }

  async deleteSite(siteId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM ${SITES_TABLE} WHERE site_id = $1`,
      [siteId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async regenerateSecret(siteId: string): Promise<Site | null> {
    const result = await this.pool.query<SiteRow>(
      `UPDATE ${SITES_TABLE} SET secret_key = $1, updated_at = now() WHERE site_id = $2 RETURNING *`,
      [generateSecretKey(), siteId],
    );
    const row = result.rows[0];
    return row ? this.toSite(row) : null;
  }

  // ─── Helpers ─────────────────────────────────────────────

  private toSite(row: SiteRow): Site {
    return {
      siteId: row.site_id,
      secretKey: row.secret_key,
      name: row.name,
      type: (row.type ?? 'web') as 'web' | 'app',
      domain: row.domain ?? undefined,
      allowedOrigins: row.allowed_origins ?? undefined,
      conversionEvents: row.conversion_events ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private toEventListItem(row: Record<string, unknown>): EventListItem {
    const ts = row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp as string);
    return {
      id: String(row.event_id ?? ''),
      type: String(row.type) as EventListItem['type'],
      timestamp: ts.toISOString(),
      visitorId: String(row.visitor_id),
      sessionId: String(row.session_id),
      url: row.url ? String(row.url) : undefined,
      referrer: row.referrer ? String(row.referrer) : undefined,
      title: row.title ? String(row.title) : undefined,
      name: row.event_name ? String(row.event_name) : undefined,
      properties: this.normalizeJsonField(row.properties),
      eventSource: row.event_source ? String(row.event_source) as EventListItem['eventSource'] : undefined,
      eventSubtype: row.event_subtype ? String(row.event_subtype) as EventListItem['eventSubtype'] : undefined,
      pagePath: row.page_path ? String(row.page_path) : undefined,
      targetUrlPath: row.target_url_path ? String(row.target_url_path) : undefined,
      elementSelector: row.element_selector ? String(row.element_selector) : undefined,
      elementText: row.element_text ? String(row.element_text) : undefined,
      scrollDepthPct: row.scroll_depth_pct !== null && row.scroll_depth_pct !== undefined ? Number(row.scroll_depth_pct) : undefined,
      userId: row.user_id ? String(row.user_id) : undefined,
      traits: this.normalizeJsonField(row.traits),
      geo: row.country ? {
        country: String(row.country),
        city: row.city ? String(row.city) : undefined,
        region: row.region ? String(row.region) : undefined,
      } : undefined,
      device: row.device_type ? {
        type: String(row.device_type),
        browser: String(row.browser ?? ''),
        os: String(row.os ?? ''),
      } : undefined,
      language: row.language ? String(row.language) : undefined,
      utm: row.utm_source ? {
        source: row.utm_source ? String(row.utm_source) : undefined,
        medium: row.utm_medium ? String(row.utm_medium) : undefined,
        campaign: row.utm_campaign ? String(row.utm_campaign) : undefined,
        term: row.utm_term ? String(row.utm_term) : undefined,
        content: row.utm_content ? String(row.utm_content) : undefined,
      } : undefined,
    };
  }

  private rowToUserDetail(u: Record<string, unknown>): UserDetail {
    const firstSeen = u.first_seen instanceof Date ? u.first_seen : new Date(u.first_seen as string);
    const lastSeen = u.last_seen instanceof Date ? u.last_seen : new Date(u.last_seen as string);
    return {
      visitorId: String(u.visitor_id),
      userId: u.user_id_out ? String(u.user_id_out) : undefined,
      traits: this.normalizeJsonField(u.traits),
      firstSeen: firstSeen.toISOString(),
      lastSeen: lastSeen.toISOString(),
      totalEvents: Number(u.total_events ?? 0),
      totalPageviews: Number(u.total_pageviews ?? 0),
      totalSessions: Number(u.total_sessions ?? 0),
      lastUrl: u.last_url ? String(u.last_url) : undefined,
      referrer: u.referrer ? String(u.referrer) : undefined,
      device: u.device_type ? {
        type: String(u.device_type),
        browser: String(u.browser ?? ''),
        os: String(u.os ?? ''),
      } : undefined,
      geo: u.country ? {
        country: String(u.country),
        city: u.city ? String(u.city) : undefined,
        region: u.region ? String(u.region) : undefined,
      } : undefined,
      language: u.language ? String(u.language) : undefined,
      timezone: u.timezone ? String(u.timezone) : undefined,
      screen: (u.screen_width || u.screen_height) ? { width: Number(u.screen_width ?? 0), height: Number(u.screen_height ?? 0) } : undefined,
      utm: u.utm_source ? {
        source: String(u.utm_source),
        medium: u.utm_medium ? String(u.utm_medium) : undefined,
        campaign: u.utm_campaign ? String(u.utm_campaign) : undefined,
        term: u.utm_term ? String(u.utm_term) : undefined,
        content: u.utm_content ? String(u.utm_content) : undefined,
      } : undefined,
    };
  }

  /**
   * Postgres jsonb columns are auto-parsed by `pg` to JS objects.
   * Defensive: handle string fallback if a column is text/legacy data.
   */
  private normalizeJsonField(value: unknown): Record<string, unknown> | undefined {
    if (value == null) return undefined;
    if (typeof value === 'object') return value as Record<string, unknown>;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return undefined; }
    }
    return undefined;
  }

}
