import { Command } from 'commander';
import { registerOverviewCommand } from './commands/overview.js';
import { registerStatsCommand } from './commands/stats.js';
import { registerTimeseriesCommand } from './commands/timeseries.js';
import { registerEventsCommand } from './commands/events.js';
import { registerUsersCommand } from './commands/users.js';
import { registerRetentionCommand } from './commands/retention.js';
import { registerBotsCommand } from './commands/bots.js';
import { registerDiscoverCommands } from './commands/discover.js';
import { registerSitesCommand } from './commands/sites.js';
import { resolveCompact, setCompactMode } from './output.js';

const program = new Command();

program
  .name('litemetrics')
  .description('Litemetrics analytics CLI - query data, manage sites, AI-agent friendly')
  .version('0.5.0')
  .option('--url <url>', 'Litemetrics server URL')
  .option('--secret <secret>', 'Admin secret')
  .option('--site <siteId>', 'Site ID (or a comma-separated list to query several sites)')
  .option('-f, --format <format>', 'Output format: json, table, csv')
  .option('--compact', 'Single-line JSON output (also via LITEMETRICS_COMPACT=1)');

// Resolve compact mode once, before any command action runs, from the global
// flag or the LITEMETRICS_COMPACT env var. Inherited by every subcommand.
program.hook('preAction', () => {
  setCompactMode(resolveCompact(program.opts().compact));
});

registerOverviewCommand(program);
registerStatsCommand(program);
registerTimeseriesCommand(program);
registerEventsCommand(program);
registerUsersCommand(program);
registerRetentionCommand(program);
registerBotsCommand(program);
registerDiscoverCommands(program);
registerSitesCommand(program);

program.parse();
