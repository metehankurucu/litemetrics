import { describe, it, expect } from 'vitest';
import { Command, type Option } from 'commander';
import { registerOverviewCommand } from './commands/overview';
import { registerStatsCommand } from './commands/stats';
import { registerTimeseriesCommand } from './commands/timeseries';
import { registerEventsCommand } from './commands/events';
import { registerUsersCommand } from './commands/users';
import { registerRetentionCommand } from './commands/retention';
import { registerBotsCommand } from './commands/bots';
import { registerDiscoverCommands } from './commands/discover';
import { registerSitesCommand } from './commands/sites';

// Commander calls an option's parser as parseArg(value, previous), where
// previous is the option's default (or the earlier value of a repeated flag).
// A bare `parseInt` parser takes that as the radix: `events -l 200` became
// parseInt('200', 50) = NaN and the server fell back to its default of 50.
function numericOptions(): { path: string; option: Option }[] {
  const program = new Command();
  registerOverviewCommand(program);
  registerStatsCommand(program);
  registerTimeseriesCommand(program);
  registerEventsCommand(program);
  registerUsersCommand(program);
  registerRetentionCommand(program);
  registerBotsCommand(program);
  registerDiscoverCommands(program);
  registerSitesCommand(program);

  const found: { path: string; option: Option }[] = [];
  const walk = (cmd: Command, prefix: string) => {
    for (const sub of cmd.commands) {
      const path = `${prefix} ${sub.name()}`.trim();
      for (const option of sub.options as Option[]) {
        if (option.parseArg) found.push({ path, option });
      }
      walk(sub, path);
    }
  };
  walk(program, '');
  return found;
}

describe('integer options', () => {
  const options = numericOptions();

  it('covers the paginated commands', () => {
    const flags = options.map(({ path, option }) => `${path} ${option.long}`);
    expect(flags).toEqual(
      expect.arrayContaining([
        'events --limit',
        'events --offset',
        'users --limit',
        'users --offset',
        'users events --limit',
        'users events --offset',
        'retention --weeks',
        'stats --limit',
      ]),
    );
  });

  it.each(options.map(({ path, option }) => [`${path} ${option.long}`, option] as const))(
    '%s reads its value in base 10 next to its default',
    (_flag, option) => {
      expect(option.parseArg!('200', option.defaultValue)).toBe(200);
      expect(option.parseArg!('12', option.defaultValue)).toBe(12);
      // A repeated flag hands the earlier value in as `previous`.
      expect(option.parseArg!('20', 200)).toBe(20);
      expect(option.parseArg!('0', undefined)).toBe(0);
    },
  );

  it.each(options.map(({ path, option }) => [`${path} ${option.long}`, option] as const))(
    '%s rejects a value that is not a whole number',
    (_flag, option) => {
      for (const bad of ['abc', '', '12abc', '-5', '1.5']) {
        expect(() => option.parseArg!(bad, option.defaultValue)).toThrow();
      }
    },
  );
});
