import type { Command } from 'commander';
import { TIMESERIES_METRIC_IDS } from '@litemetrics/core';
import { loadConfig, requireSiteId } from '../config.js';
import { makeAnalyticsClient } from '../client.js';
import { resolveFormat, output, parseFilters, handleError, invalidMetric } from '../output.js';

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
      try {
        const config = loadConfig({ url: globalOpts.url, adminSecret: globalOpts.secret, siteId: globalOpts.site });
        const siteId = await requireSiteId(config);
        const client = makeAnalyticsClient(config);
        client.setSiteId(siteId);

        const result = await client.getTimeSeries(metric as TSMetric, {
          period: opts.period,
          dateFrom: opts.from,
          dateTo: opts.to,
          granularity: opts.granularity,
          filters: parseFilters(opts.filter),
          timezone: opts.timezone,
          includeBots: opts.includeBots,
        });

        const headers = ['Date', 'Value'];
        const rows = result.data.map(d => [d.date, String(d.value)]);
        const footer = `Metric: ${result.metric} | Granularity: ${result.granularity}`;

        output(result, format, { headers, rows, footer });
      } catch (err) {
        handleError(err, format);
      }
    });
}
