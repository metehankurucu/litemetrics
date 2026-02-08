/**
 * Backfill identity map from existing identify events.
 *
 * Usage:
 *   bun packages/node/src/backfill-identity.ts --adapter clickhouse --url http://localhost:8123
 *   bun packages/node/src/backfill-identity.ts --adapter mongodb --url mongodb://localhost:27017/litemetrics
 */

import { ClickHouseAdapter } from './adapters/clickhouse';
import { MongoDBAdapter } from './adapters/mongodb';
import type { DBAdapter } from '@litemetrics/core';

async function main() {
  const args = process.argv.slice(2);
  const adapterType = getArg(args, '--adapter') || 'clickhouse';
  const url = getArg(args, '--url');

  if (!url) {
    console.error('Usage: bun backfill-identity.ts --adapter <clickhouse|mongodb> --url <connection-url>');
    process.exit(1);
  }

  let db: DBAdapter;
  if (adapterType === 'clickhouse') {
    db = new ClickHouseAdapter(url);
  } else if (adapterType === 'mongodb') {
    db = new MongoDBAdapter(url);
  } else {
    console.error(`Unknown adapter: ${adapterType}`);
    process.exit(1);
  }

  await db.init();
  console.log(`Connected to ${adapterType} at ${url}`);

  // Query all identify events that have a userId
  const sites = await db.listSites();
  let totalUpserted = 0;

  for (const site of sites) {
    console.log(`Processing site: ${site.name} (${site.siteId})`);

    let offset = 0;
    const batchSize = 200;
    let siteCount = 0;

    while (true) {
      const result = await db.listEvents({
        siteId: site.siteId,
        type: 'identify',
        limit: batchSize,
        offset,
      });

      for (const event of result.events) {
        if (event.userId && event.visitorId) {
          await db.upsertIdentity(site.siteId, event.visitorId, event.userId);
          siteCount++;
        }
      }

      offset += batchSize;
      if (result.events.length < batchSize) break;
    }

    console.log(`  -> Upserted ${siteCount} identity mappings`);
    totalUpserted += siteCount;
  }

  console.log(`\nDone! Total identity mappings upserted: ${totalUpserted}`);
  await db.close();
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
