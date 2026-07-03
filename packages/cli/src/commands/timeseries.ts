import type { Command } from 'commander';
import { TIMESERIES_METRIC_IDS } from '@litemetrics/core';
import { loadConfig, resolveSiteIds } from '../config.js';
import { makeAnalyticsClient } from '../client.js';
import { resolveFormat, parseFilters, handleError, invalidMetric, validatePeriod } from '../output.js';
import { runPerSite } from '../multisite.js';

type TSMetric = 'pageviews' | 'visitors' | 'sessions' | 'events' | 'conversions';

export function registerTimeseriesCommand(program: Command) {
  program
    .command('timeseries <metric>')
    .description('Query time series data (pageviews, visitors, sessions, events, conversions)')
    .option('-p, --period <period>', 'Period: 1h, 24h, 7d, 30d, 90d, custom', '7d')
    .option('--from <date>', 'Start date (ISO)')
    .option('--to <date>', 'End date (ISO)')
    .option('-g, --granularity <g>', 'Granularity: hour, day, week, month')
    .option('--filter <kv...>', 'Filters (key=value, repeatable). See `litemetrics filters`')
    .option('--timezone <tz>', 'IANA timezone (e.g. Europe/Istanbul)')
    .option('--include-bots', 'Include events flagged by the bot filter')
    .action(async (metric: string, opts) => {
      const globalOpts = program.opts();
      const format = resolveFormat(globalOpts.format);
      if (!TIMESERIES_METRIC_IDS.includes(metric as TSMetric)) {
        invalidMetric(metric, TIMESERIES_METRIC_IDS, format, 'litemetrics metrics');
      }
      validatePeriod(opts.period, opts.from, opts.to, format);
      try {
        const config = loadConfig({ url: globalOpts.url, adminSecret: globalOpts.secret, siteId: globalOpts.site }, format);
        const siteIds = await resolveSiteIds(config, format);
        const client = makeAnalyticsClient(config);

        await runPerSite(siteIds, format, {
          run: (siteId) => {
            client.setSiteId(siteId);
            return client.getTimeSeries(metric as TSMetric, {
              period: opts.period,
              dateFrom: opts.from,
              dateTo: opts.to,
              granularity: opts.granularity,
              filters: parseFilters(opts.filter),
              timezone: opts.timezone,
              includeBots: opts.includeBots,
            });
          },
          table: (result) => ({
            headers: ['Date', 'Value'],
            rows: result.data.map(d => [d.date, String(d.value)]),
            footer: `Metric: ${result.metric} | Granularity: ${result.granularity}`,
          }),
        });
      } catch (err) {
        handleError(err, format);
      }
    });
}
