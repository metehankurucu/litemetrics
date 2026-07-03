import type { Command } from 'commander';
import type { Metric } from '@litemetrics/core';
import { loadConfig, resolveSiteIds } from '../config.js';
import { makeAnalyticsClient } from '../client.js';
import { resolveFormat, handleError, validatePeriod } from '../output.js';
import { runPerSite } from '../multisite.js';

export function registerOverviewCommand(program: Command) {
  program
    .command('overview')
    .description('Get overview of all key metrics')
    .option('-p, --period <period>', 'Period: 1h, 24h, 7d, 30d, 90d, custom', '24h')
    .option('--from <date>', 'Start date for custom period (ISO)')
    .option('--to <date>', 'End date for custom period (ISO)')
    .option('-c, --compare', 'Compare with previous period')
    .option('-m, --metrics <list>', 'Comma-separated metrics', 'pageviews,visitors,sessions,events,conversions')
    .option('--include-bots', 'Include events flagged by the bot filter')
    .action(async (opts) => {
      const globalOpts = program.opts();
      const format = resolveFormat(globalOpts.format);
      validatePeriod(opts.period, opts.from, opts.to, format);
      try {
        const config = loadConfig({ url: globalOpts.url, adminSecret: globalOpts.secret, siteId: globalOpts.site }, format);
        const siteIds = await resolveSiteIds(config, format);
        const client = makeAnalyticsClient(config);
        const metrics = opts.metrics.split(',') as Metric[];

        await runPerSite(siteIds, format, {
          run: (siteId) => {
            client.setSiteId(siteId);
            return client.getOverview(metrics, {
              period: opts.period,
              dateFrom: opts.from,
              dateTo: opts.to,
              compare: opts.compare,
              includeBots: opts.includeBots,
            });
          },
          table: (result) => {
            const headers = opts.compare
              ? ['Metric', 'Total', 'Previous', 'Change']
              : ['Metric', 'Total'];

            const rows = metrics.map(m => {
              const r = result[m];
              if (!r) return opts.compare ? [m, '0', '0', '-'] : [m, '0'];
              if (opts.compare) {
                const change = r.changePercent != null ? `${r.changePercent > 0 ? '+' : ''}${r.changePercent.toFixed(1)}%` : '-';
                return [m, String(r.total), String(r.previousTotal ?? '-'), change];
              }
              return [m, String(r.total)];
            });

            return { headers, rows };
          },
        });
      } catch (err) {
        handleError(err, format);
      }
    });
}
