import type { Command } from 'commander';
import { METRIC_CATALOG, FILTER_KEYS } from '@litemetrics/core';
import { resolveFormat, output } from '../output.js';

export function registerDiscoverCommands(program: Command) {
  program
    .command('metrics')
    .description('List every metric you can pass to `stats` / `timeseries` (no server call)')
    .action(() => {
      const globalOpts = program.opts();
      const format = resolveFormat(globalOpts.format);

      const headers = ['Metric', 'Category', 'Timeseries', 'Description'];
      const rows = METRIC_CATALOG.map(m => [
        m.metric,
        m.category,
        m.timeseries ? 'yes' : '-',
        m.description,
      ]);
      const footer = 'Also: `timeseries <metric>` (timeseries=yes), `retention`, `bots`. Filters: `litemetrics filters`.';

      output(METRIC_CATALOG, format, { headers, rows, footer });
    });

  program
    .command('filters')
    .description('List every `--filter key=value` key (no server call)')
    .action(() => {
      const globalOpts = program.opts();
      const format = resolveFormat(globalOpts.format);

      const headers = ['Key', 'Example', 'Description'];
      const rows = FILTER_KEYS.map(f => [f.key, `${f.key}=${f.example}`, f.description]);
      const footer = 'Filters are ANDed and matched by equality. Repeat --filter to combine.';

      output(FILTER_KEYS, format, { headers, rows, footer });
    });
}
