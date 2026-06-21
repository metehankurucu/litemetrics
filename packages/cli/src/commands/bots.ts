import type { Command } from 'commander';
import { loadConfig, requireSiteId } from '../config.js';
import { makeAnalyticsClient } from '../client.js';
import { resolveFormat, output, handleError } from '../output.js';

export function registerBotsCommand(program: Command) {
  program
    .command('bots')
    .description('Bot-filter stats: events flagged by each detection layer')
    .option('-p, --period <period>', 'Period: 1h, 24h, 7d, 30d, 90d, custom', '24h')
    .option('--from <date>', 'Start date (ISO)')
    .option('--to <date>', 'End date (ISO)')
    .action(async (opts) => {
      const globalOpts = program.opts();
      const format = resolveFormat(globalOpts.format);
      try {
        const config = loadConfig({ url: globalOpts.url, adminSecret: globalOpts.secret, siteId: globalOpts.site });
        const siteId = await requireSiteId(config);
        const client = makeAnalyticsClient(config);
        client.setSiteId(siteId);

        const result = await client.getBotStats({
          period: opts.period,
          dateFrom: opts.from,
          dateTo: opts.to,
        });

        const headers = ['Layer', 'Flagged'];
        const rows = [
          ['signature', String(result.bySignature)],
          ['heuristic', String(result.byHeuristic)],
          ['rate-limit', String(result.byRateLimit)],
        ];
        const footer = `Total flagged: ${result.total}`;

        output(result, format, { headers, rows, footer });
      } catch (err) {
        handleError(err, format);
      }
    });
}
