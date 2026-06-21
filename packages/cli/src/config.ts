import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface CLIConfig {
  url: string;
  adminSecret: string;
  siteId?: string;
}

interface RCFile {
  url?: string;
  adminSecret?: string;
  siteId?: string;
}

function loadRCFile(): RCFile {
  try {
    const rcPath = join(homedir(), '.litemetricsrc');
    const content = readFileSync(rcPath, 'utf-8');
    return JSON.parse(content) as RCFile;
  } catch {
    return {};
  }
}

export function loadConfig(flags: Partial<CLIConfig>): CLIConfig {
  const rc = loadRCFile();

  const url = flags.url || process.env.LITEMETRICS_URL || rc.url || '';
  const adminSecret = flags.adminSecret || process.env.LITEMETRICS_ADMIN_SECRET || rc.adminSecret || '';
  const siteId = flags.siteId || process.env.LITEMETRICS_SITE_ID || rc.siteId;

  if (!url) {
    console.error('Error: Server URL is required. Use --url, LITEMETRICS_URL env var, or ~/.litemetricsrc');
    process.exit(1);
  }

  if (!adminSecret) {
    console.error('Error: Admin secret is required. Use --secret, LITEMETRICS_ADMIN_SECRET env var, or ~/.litemetricsrc');
    process.exit(1);
  }

  return { url, adminSecret, siteId };
}

/**
 * Resolve the site ID to query. If none is configured, auto-resolve: when the
 * account has exactly one site, use it; otherwise print a helpful list/hint and
 * exit. This lets agents query without first looking up the site ID.
 */
export async function requireSiteId(config: CLIConfig): Promise<string> {
  if (config.siteId) return config.siteId;

  try {
    const { makeSitesClient } = await import('./client.js');
    const { sites } = await makeSitesClient(config).listSites();

    if (sites.length === 1) {
      const only = sites[0];
      console.error(`Note: no --site given; using the only site: ${only.siteId} (${only.name})`);
      return only.siteId;
    }
    if (sites.length === 0) {
      console.error('Error: no sites found. Create one with `litemetrics sites create -n "Name"`.');
      process.exit(1);
    }
    console.error('Error: multiple sites found. Specify --site <siteId> (or LITEMETRICS_SITE_ID). Available:');
    for (const s of sites) console.error(`  ${s.siteId}  ${s.name}`);
    process.exit(1);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: Site ID is required (--site, LITEMETRICS_SITE_ID, or ~/.litemetricsrc). Auto-resolve failed: ${message}`);
    process.exit(1);
  }
}
