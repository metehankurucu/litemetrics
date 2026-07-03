import type { Command } from 'commander';
import { loadConfig, requireSiteId } from '../config.js';
import { makeAnalyticsClient } from '../client.js';
import { resolveFormat, output, handleError, validatePeriod } from '../output.js';

export function registerEventsCommand(program: Command) {
  program
    .command('events')
    .description('List events with filtering')
    .option('-t, --type <type>', 'Event type: pageview, event, identify')
    .option('-n, --name <name>', 'Filter by event name')
    .option('--names <list>', 'Comma-separated event names')
    .option('--source <source>', 'Event source: auto, manual')
    .option('--visitor <id>', 'Filter by visitor ID')
    .option('--user <id>', 'Filter by user ID')
    .option('-p, --period <period>', 'Period: 1h, 24h, 7d, 30d, 90d, custom', '24h')
    .option('--from <date>', 'Start date (ISO)')
    .option('--to <date>', 'End date (ISO)')
    .option('-l, --limit <n>', 'Limit results', parseInt, 50)
    .option('--offset <n>', 'Offset for pagination', parseInt)
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

        const result = await client.getEventsList({
          type: opts.type,
          eventName: opts.name,
          eventNames: opts.names ? opts.names.split(',') : undefined,
          eventSource: opts.source,
          visitorId: opts.visitor,
          userId: opts.user,
          period: opts.period,
          dateFrom: opts.from,
          dateTo: opts.to,
          limit: opts.limit,
          offset: opts.offset,
          includeBots: opts.includeBots,
        });

        const headers = ['Time', 'Type', 'Detail', 'Visitor', 'Country', 'City'];
        const rows = result.events.map(e => {
          const time = new Date(e.timestamp).toLocaleString();
          const detail = e.type === 'pageview' ? (e.url || '') : e.type === 'event' ? (e.name || '') : (e.userId || '');
          return [
            time,
            e.type,
            detail,
            e.visitorId?.slice(0, 12) || '',
            e.geo?.country || '',
            e.geo?.city || '',
          ];
        });
        const footer = `Total: ${result.total} | Showing: ${result.offset}-${result.offset + result.events.length}`;

        output(result, format, { headers, rows, footer });
      } catch (err) {
        handleError(err, format);
      }
    });
}
