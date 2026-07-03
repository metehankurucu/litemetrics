import type { Command } from 'commander';
import { loadConfig } from '../config.js';
import { makeSitesClient } from '../client.js';
import { resolveFormat, output, handleError } from '../output.js';

export function registerSitesCommand(program: Command) {
  const sites = program
    .command('sites')
    .description('Manage sites (list, get, create, update, delete)')
    .action(async () => {
      await listSites(program);
    });

  sites
    .command('list')
    .description('List all sites')
    .action(async () => {
      await listSites(program);
    });

  sites
    .command('get <siteId>')
    .description('Get site details')
    .action(async (siteId: string) => {
      const globalOpts = program.opts();
      const format = resolveFormat(globalOpts.format);
      try {
        const config = loadConfig({ url: globalOpts.url, adminSecret: globalOpts.secret }, format);
        const client = makeSitesClient(config);
        const result = await client.getSite(siteId);

        const headers = ['Field', 'Value'];
        const rows = [
          ['Site ID', result.site.siteId],
          ['Name', result.site.name],
          ['Type', result.site.type || 'web'],
          ['Domain', result.site.domain || '-'],
          ['Secret Key', result.site.secretKey],
          ['Origins', result.site.allowedOrigins?.join(', ') || '-'],
          ['Conversions', result.site.conversionEvents?.join(', ') || '-'],
          ['Created', new Date(result.site.createdAt).toLocaleString()],
          ['Updated', new Date(result.site.updatedAt).toLocaleString()],
        ];

        output(result, format, { headers, rows });
      } catch (err) {
        handleError(err, format);
      }
    });

  sites
    .command('create')
    .description('Create a new site')
    .requiredOption('-n, --name <name>', 'Site name')
    .option('--type <type>', 'Site type: web, app')
    .option('--domain <domain>', 'Domain')
    .option('--origins <list>', 'Comma-separated allowed origins')
    .option('--conversions <list>', 'Comma-separated conversion event names')
    .action(async (opts) => {
      const globalOpts = program.opts();
      const format = resolveFormat(globalOpts.format);
      try {
        const config = loadConfig({ url: globalOpts.url, adminSecret: globalOpts.secret }, format);
        const client = makeSitesClient(config);
        const result = await client.createSite({
          name: opts.name,
          type: opts.type,
          domain: opts.domain,
          allowedOrigins: opts.origins ? opts.origins.split(',').map((s: string) => s.trim()) : undefined,
          conversionEvents: opts.conversions ? opts.conversions.split(',').map((s: string) => s.trim()) : undefined,
        });

        output(result, format, {
          headers: ['Site ID', 'Name', 'Secret Key'],
          rows: [[result.site.siteId, result.site.name, result.site.secretKey]],
        });
      } catch (err) {
        handleError(err, format);
      }
    });

  sites
    .command('update <siteId>')
    .description('Update a site')
    .option('-n, --name <name>', 'Site name')
    .option('--type <type>', 'Site type: web, app')
    .option('--domain <domain>', 'Domain')
    .option('--origins <list>', 'Comma-separated allowed origins')
    .option('--conversions <list>', 'Comma-separated conversion event names')
    .action(async (siteId: string, opts) => {
      const globalOpts = program.opts();
      const format = resolveFormat(globalOpts.format);
      try {
        const config = loadConfig({ url: globalOpts.url, adminSecret: globalOpts.secret }, format);
        const client = makeSitesClient(config);
        const result = await client.updateSite(siteId, {
          name: opts.name,
          type: opts.type,
          domain: opts.domain,
          allowedOrigins: opts.origins ? opts.origins.split(',').map((s: string) => s.trim()) : undefined,
          conversionEvents: opts.conversions ? opts.conversions.split(',').map((s: string) => s.trim()) : undefined,
        });

        output(result, format, {
          headers: ['Site ID', 'Name'],
          rows: [[result.site.siteId, result.site.name]],
        });
      } catch (err) {
        handleError(err, format);
      }
    });

  sites
    .command('delete <siteId>')
    .description('Delete a site')
    .action(async (siteId: string) => {
      const globalOpts = program.opts();
      const format = resolveFormat(globalOpts.format);
      try {
        const config = loadConfig({ url: globalOpts.url, adminSecret: globalOpts.secret }, format);
        const client = makeSitesClient(config);
        const result = await client.deleteSite(siteId);

        output(result, format, {
          headers: ['Site ID', 'Deleted'],
          rows: [[siteId, String(result.ok)]],
        });
      } catch (err) {
        handleError(err, format);
      }
    });

  sites
    .command('regenerate <siteId>')
    .description('Regenerate secret key for a site')
    .action(async (siteId: string) => {
      const globalOpts = program.opts();
      const format = resolveFormat(globalOpts.format);
      try {
        const config = loadConfig({ url: globalOpts.url, adminSecret: globalOpts.secret }, format);
        const client = makeSitesClient(config);
        const result = await client.regenerateSecret(siteId);

        output(result, format, {
          headers: ['Site ID', 'Secret Key'],
          rows: [[result.site.siteId, result.site.secretKey]],
        });
      } catch (err) {
        handleError(err, format);
      }
    });
}

async function listSites(program: Command) {
  const globalOpts = program.opts();
  const format = resolveFormat(globalOpts.format);
  try {
    const config = loadConfig({ url: globalOpts.url, adminSecret: globalOpts.secret }, format);
    const client = makeSitesClient(config);
    const result = await client.listSites();

    const headers = ['Site ID', 'Name', 'Type', 'Domain', 'Created'];
    const rows = result.sites.map(s => [
      s.siteId,
      s.name,
      s.type || 'web',
      s.domain || '-',
      new Date(s.createdAt).toLocaleDateString(),
    ]);
    const footer = `Total: ${result.total} sites`;

    output(result, format, { headers, rows, footer });
  } catch (err) {
    handleError(err, format);
  }
}
