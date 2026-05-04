/**
 * Streaming backup of ClickHouse data to local JSONL files.
 *
 * Usage:
 *   CLICKHOUSE_URL=<url> bun scripts/backup-clickhouse.ts [--out <dir>]
 *
 * Default output: backup/clickhouse-YYYYMMDD-HHMMSS/
 *   - sites.jsonl
 *   - identity_map.jsonl
 *   - events.jsonl
 *   - manifest.json (row counts, timestamp)
 */

import { createClient } from '@clickhouse/client';
import { mkdirSync, createWriteStream, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BATCH = 5000;

async function main() {
  const url = process.env.CLICKHOUSE_URL;
  if (!url) {
    console.error('Missing CLICKHOUSE_URL');
    process.exit(1);
  }

  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = outIdx >= 0 ? argv[outIdx + 1] : `backup/clickhouse-${ts}`;
  mkdirSync(outDir, { recursive: true });

  console.log(`Backing up ClickHouse → ${outDir}`);
  console.log(`  ${url.replace(/:[^@/]+@/, ':***@')}\n`);

  const ch = createClient({ url });
  const counts: Record<string, number> = {};

  try {
    counts.sites = await dumpAll(ch, 'litemetrics_sites FINAL', join(outDir, 'sites.jsonl'));
    counts.identity_map = await dumpAll(ch, 'litemetrics_identity_map FINAL', join(outDir, 'identity_map.jsonl'));
    counts.events = await dumpEvents(ch, join(outDir, 'events.jsonl'));

    writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({
      timestamp: new Date().toISOString(),
      source: url.replace(/:[^@/]+@/, ':***@'),
      counts,
    }, null, 2));

    console.log(`\n✓ Backup complete`);
    console.log(`  sites:        ${counts.sites.toLocaleString()}`);
    console.log(`  identity_map: ${counts.identity_map.toLocaleString()}`);
    console.log(`  events:       ${counts.events.toLocaleString()}`);
    console.log(`  Location:     ${outDir}`);
  } finally {
    await ch.close();
  }
}

async function dumpAll(ch: ReturnType<typeof createClient>, fromClause: string, outPath: string): Promise<number> {
  const tableName = fromClause.split(/\s/)[0];
  process.stdout.write(`→ Dumping ${tableName}... `);
  const result = await ch.query({
    query: `SELECT * FROM ${fromClause}`,
    format: 'JSONEachRow',
  });
  const rows = await result.json<Record<string, unknown>>();
  const stream = createWriteStream(outPath);
  for (const r of rows) stream.write(JSON.stringify(r) + '\n');
  await new Promise<void>((resolve) => stream.end(resolve));
  console.log(`${rows.length.toLocaleString()} rows → ${outPath}`);
  return rows.length;
}

async function dumpEvents(ch: ReturnType<typeof createClient>, outPath: string): Promise<number> {
  const countResult = await ch.query({
    query: 'SELECT count() AS total FROM litemetrics_events',
    format: 'JSONEachRow',
  });
  const total = Number((await countResult.json<{ total: string }>())[0]?.total ?? 0);
  console.log(`→ Dumping ${total.toLocaleString()} events...`);

  const stream = createWriteStream(outPath);
  let offset = 0;
  let written = 0;
  const startTime = Date.now();

  while (offset < total) {
    const batch = await ch.query({
      query: `SELECT
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
              ORDER BY timestamp ASC
              LIMIT ${BATCH} OFFSET ${offset}`,
      format: 'JSONEachRow',
    });
    const rows = await batch.json<Record<string, unknown>>();
    if (rows.length === 0) break;

    for (const r of rows) stream.write(JSON.stringify(r) + '\n');
    written += rows.length;
    offset += rows.length;

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round(written / Math.max(elapsed, 0.001));
    const pct = Math.round((written / total) * 100);
    process.stdout.write(`\r  ${written.toLocaleString()}/${total.toLocaleString()} (${pct}%) — ${rate} rows/s    `);
  }

  await new Promise<void>((resolve) => stream.end(resolve));
  console.log(`\n  ✓ ${written.toLocaleString()} events → ${outPath}`);
  return written;
}

main().catch((err) => {
  console.error('\n✗ Backup failed:', err);
  process.exit(1);
});
