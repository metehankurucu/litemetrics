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

const program = new Command();

program
  .name('litemetrics')
  .description('Litemetrics analytics CLI - query data, manage sites, AI-agent friendly')
  .version('0.5.0')
  .option('--url <url>', 'Litemetrics server URL')
  .option('--secret <secret>', 'Admin secret')
  .option('--site <siteId>', 'Site ID')
  .option('-f, --format <format>', 'Output format: json, table, csv');

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
