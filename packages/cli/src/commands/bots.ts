import type { Command } from 'commander';
import { loadConfig, resolveSiteIds } from '../config.js';
import { makeAnalyticsClient } from '../client.js';
import { resolveFormat, handleError, validatePeriod } from '../output.js';
import { runPerSite } from '../multisite.js';

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
      validatePeriod(opts.period, opts.from, opts.to, format);
      try {
        const config = loadConfig({ url: globalOpts.url, adminSecret: globalOpts.secret, siteId: globalOpts.site }, format);
        const siteIds = await resolveSiteIds(config, format);
        const client = makeAnalyticsClient(config);

        await runPerSite(siteIds, format, {
          run: (siteId) => {
            client.setSiteId(siteId);
            return client.getBotStats({
              period: opts.period,
              dateFrom: opts.from,
              dateTo: opts.to,
            });
          },
          table: (result) => ({
            headers: ['Layer', 'Flagged'],
            rows: [
              ['signature', String(result.bySignature)],
              ['heuristic', String(result.byHeuristic)],
              ['rate-limit', String(result.byRateLimit)],
            ],
            footer: `Total flagged: ${result.total}`,
          }),
        });
      } catch (err) {
        handleError(err, format);
      }
    });
}
