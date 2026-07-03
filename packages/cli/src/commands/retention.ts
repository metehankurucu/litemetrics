import type { Command } from 'commander';
import { loadConfig, requireSiteId } from '../config.js';
import { makeAnalyticsClient } from '../client.js';
import { resolveFormat, output, handleError, validatePeriod } from '../output.js';

export function registerRetentionCommand(program: Command) {
  program
    .command('retention')
    .description('Query cohort retention data')
    .option('-p, --period <period>', 'Period: 7d, 30d, 90d', '90d')
    .option('-w, --weeks <n>', 'Number of weeks', parseInt, 8)
    .option('--include-bots', 'Include events flagged by the bot filter')
    .action(async (opts) => {
      const globalOpts = program.opts();
      const format = resolveFormat(globalOpts.format);
      validatePeriod(opts.period, undefined, undefined, format);
      try {
        const config = loadConfig({ url: globalOpts.url, adminSecret: globalOpts.secret, siteId: globalOpts.site }, format);
        const siteId = await requireSiteId(config, format);
        const client = makeAnalyticsClient(config);
        client.setSiteId(siteId);

        const result = await client.getRetention({
          period: opts.period,
          weeks: opts.weeks,
          includeBots: opts.includeBots,
        });

        const weekCount = result.cohorts.length > 0
          ? Math.max(...result.cohorts.map(c => c.retention.length))
          : 0;

        const weekHeaders = Array.from({ length: weekCount }, (_, i) => `W${i}`);
        const headers = ['Week', 'Size', ...weekHeaders];

        const rows = result.cohorts.map(c => [
          c.week,
          String(c.size),
          ...c.retention.map(r => `${r.toFixed(1)}%`),
        ]);

        output(result, format, { headers, rows });
      } catch (err) {
        handleError(err, format);
      }
    });
}
