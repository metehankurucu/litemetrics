import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { errorEnvelope, type Format } from './output.js';

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

export function loadConfig(flags: Partial<CLIConfig>, format: Format): CLIConfig {
  const rc = loadRCFile();

  const url = flags.url || process.env.LITEMETRICS_URL || rc.url || '';
  const adminSecret = flags.adminSecret || process.env.LITEMETRICS_ADMIN_SECRET || rc.adminSecret || '';
  const siteId = flags.siteId || process.env.LITEMETRICS_SITE_ID || rc.siteId;

  if (!url) {
    errorEnvelope('Server URL is required. Use --url, LITEMETRICS_URL env var, or ~/.litemetricsrc', format);
  }

  if (!adminSecret) {
    errorEnvelope('Admin secret is required. Use --secret, LITEMETRICS_ADMIN_SECRET env var, or ~/.litemetricsrc', format);
  }

  return { url, adminSecret, siteId };
}

/**
 * R7: split a `--site` value (which may be a comma-separated list) into an
 * array of trimmed, non-empty site IDs. Returns `[]` for undefined/empty input.
 */
export function splitSiteIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Resolve the site IDs to query. An explicit `--site` (possibly a comma list) is
 * used verbatim. When none is configured, auto-resolve: exactly one site => use
 * it (with a note on stderr); zero or many => error envelope + exit(1). Always
 * returns at least one ID. This lets agents query without first looking up IDs,
 * and query several sites in one invocation with `--site a,b`.
 */
export async function resolveSiteIds(config: CLIConfig, format: Format): Promise<string[]> {
  const explicit = splitSiteIds(config.siteId);
  if (explicit.length > 0) return explicit;

  try {
    const { makeSitesClient } = await import('./client.js');
    const { sites } = await makeSitesClient(config).listSites();

    if (sites.length === 1) {
      const only = sites[0];
      console.error(`Note: no --site given; using the only site: ${only.siteId} (${only.name})`);
      return [only.siteId];
    }
    if (sites.length === 0) {
      errorEnvelope('No sites found. Create one with `litemetrics sites create -n "Name"`.', format);
    }
    const available = sites.map((s) => `${s.siteId} (${s.name})`);
    errorEnvelope(
      `Multiple sites found. Specify --site <siteId> (or a comma list, or LITEMETRICS_SITE_ID). Available: ${available.join(', ')}`,
      format,
      { suggestions: sites.map((s) => s.siteId) },
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'exit') throw err;
    const message = err instanceof Error ? err.message : String(err);
    errorEnvelope(
      `Site ID is required (--site, LITEMETRICS_SITE_ID, or ~/.litemetricsrc). Auto-resolve failed: ${message}`,
      format,
    );
  }
}
