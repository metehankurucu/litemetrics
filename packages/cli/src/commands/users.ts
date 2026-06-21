import type { Command } from 'commander';
import { loadConfig, requireSiteId } from '../config.js';
import { makeAnalyticsClient } from '../client.js';
import { resolveFormat, output, handleError } from '../output.js';

export function registerUsersCommand(program: Command) {
  const users = program
    .command('users')
    .description('List users or get user details')
    .option('-s, --search <query>', 'Search by visitor/user ID')
    .option('-l, --limit <n>', 'Limit results', parseInt, 30)
    .option('--offset <n>', 'Offset for pagination', parseInt)
    .option('--include-bots', 'Include events flagged by the bot filter')
    .action(async (opts) => {
      const globalOpts = program.opts();
      const format = resolveFormat(globalOpts.format);
      try {
        const config = loadConfig({ url: globalOpts.url, adminSecret: globalOpts.secret, siteId: globalOpts.site });
        const siteId = await requireSiteId(config);
        const client = makeAnalyticsClient(config);
        client.setSiteId(siteId);

        const result = await client.getUsers({
          search: opts.search,
          limit: opts.limit,
          offset: opts.offset,
          includeBots: opts.includeBots,
        });

        const headers = ['User', 'Visitor ID', 'Events', 'Pages', 'Sessions', 'Last Seen', 'Country'];
        const rows = result.users.map(u => [
          u.userId || 'Anonymous',
          u.visitorId.slice(0, 12),
          String(u.totalEvents),
          String(u.totalPageviews),
          String(u.totalSessions),
          new Date(u.lastSeen).toLocaleString(),
          u.geo?.country || '',
        ]);
        const footer = `Total: ${result.total} | Showing: ${result.offset}-${result.offset + result.users.length}`;

        output(result, format, { headers, rows, footer });
      } catch (err) {
        handleError(err, format);
      }
    });

  users
    .command('detail <identifier>')
    .description('Get detailed info for a user (by userId or visitorId)')
    .action(async (identifier: string) => {
      const globalOpts = program.opts();
      const format = resolveFormat(globalOpts.format);
      try {
        const config = loadConfig({ url: globalOpts.url, adminSecret: globalOpts.secret, siteId: globalOpts.site });
        const siteId = await requireSiteId(config);
        const client = makeAnalyticsClient(config);
        client.setSiteId(siteId);

        const result = await client.getUserDetail(identifier);

        const headers = ['Field', 'Value'];
        const rows = [
          ['User ID', result.userId || 'Anonymous'],
          ['Visitor ID', result.visitorId],
          ['Linked Devices', String(result.visitorIds?.length || 1)],
          ['First Seen', new Date(result.firstSeen).toLocaleString()],
          ['Last Seen', new Date(result.lastSeen).toLocaleString()],
          ['Total Events', String(result.totalEvents)],
          ['Total Pageviews', String(result.totalPageviews)],
          ['Total Sessions', String(result.totalSessions)],
          ['Last URL', result.lastUrl || '-'],
          ['Referrer', result.referrer || '-'],
          ['Country', result.geo?.country || '-'],
          ['City', result.geo?.city || '-'],
          ['Browser', result.device?.browser || '-'],
          ['OS', result.device?.os || '-'],
          ['Device', result.device?.type || '-'],
          ['Language', result.language || '-'],
          ['Timezone', result.timezone || '-'],
        ];

        if (result.utm) {
          if (result.utm.source) rows.push(['UTM Source', result.utm.source]);
          if (result.utm.medium) rows.push(['UTM Medium', result.utm.medium]);
          if (result.utm.campaign) rows.push(['UTM Campaign', result.utm.campaign]);
        }

        if (result.traits && Object.keys(result.traits).length > 0) {
          rows.push(['Traits', JSON.stringify(result.traits)]);
        }

        output(result, format, { headers, rows });
      } catch (err) {
        handleError(err, format);
      }
    });

  users
    .command('events <identifier>')
    .description("Get a user's events")
    .option('-t, --type <type>', 'Event type: pageview, event, identify')
    .option('-n, --name <name>', 'Filter by event name')
    .option('-p, --period <period>', 'Period', '30d')
    .option('-l, --limit <n>', 'Limit results', parseInt, 30)
    .option('--offset <n>', 'Offset for pagination', parseInt)
    .option('--include-bots', 'Include events flagged by the bot filter')
    .action(async (identifier: string, opts) => {
      const globalOpts = program.opts();
      const format = resolveFormat(globalOpts.format);
      try {
        const config = loadConfig({ url: globalOpts.url, adminSecret: globalOpts.secret, siteId: globalOpts.site });
        const siteId = await requireSiteId(config);
        const client = makeAnalyticsClient(config);
        client.setSiteId(siteId);

        const result = await client.getUserEvents(identifier, {
          type: opts.type,
          eventName: opts.name,
          period: opts.period,
          limit: opts.limit,
          offset: opts.offset,
          includeBots: opts.includeBots,
        });

        const headers = ['Time', 'Type', 'Detail', 'Country', 'City'];
        const rows = result.events.map(e => {
          const time = new Date(e.timestamp).toLocaleString();
          const detail = e.type === 'pageview' ? (e.url || '') : e.type === 'event' ? (e.name || '') : (e.userId || '');
          return [time, e.type, detail, e.geo?.country || '', e.geo?.city || ''];
        });
        const footer = `Total: ${result.total} | Showing: ${result.offset}-${result.offset + result.events.length}`;

        output(result, format, { headers, rows, footer });
      } catch (err) {
        handleError(err, format);
      }
    });
}
