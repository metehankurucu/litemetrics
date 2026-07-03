import type { Command } from 'commander';
import type { Metric } from '@litemetrics/core';
import { loadConfig, requireSiteId } from '../config.js';
import { makeAnalyticsClient } from '../client.js';
import { resolveFormat, output, handleError, validatePeriod } from '../output.js';

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
        const siteId = await requireSiteId(config, format);
        const client = makeAnalyticsClient(config);
        client.setSiteId(siteId);

        const metrics = opts.metrics.split(',') as Metric[];
        const result = await client.getOverview(metrics, {
          period: opts.period,
          dateFrom: opts.from,
          dateTo: opts.to,
          compare: opts.compare,
          includeBots: opts.includeBots,
        });

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

        output(result, format, { headers, rows });
      } catch (err) {
        handleError(err, format);
      }
    });
}
