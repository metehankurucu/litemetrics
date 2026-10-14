import { describe, it, expect, vi, afterEach } from 'vitest';
import { Command } from 'commander';

// Parse real argv through Commander with config + network stubbed, and assert
// what reaches the client. Calling an option's parser directly cannot see which
// command in the chain a flag lands on.
vi.mock('./config.js', () => ({
  loadConfig: vi.fn(() => ({ url: 'https://x.test', adminSecret: 'sk_x', siteId: 'site_1' })),
  resolveSiteIds: vi.fn(async () => ['site_1']),
}));
vi.mock('./client.js', () => ({
  makeAnalyticsClient: vi.fn(),
}));

import { registerEventsCommand } from './commands/events';
import { registerUsersCommand } from './commands/users';
import { registerRetentionCommand } from './commands/retention';
import { registerStatsCommand } from './commands/stats';
import { makeAnalyticsClient } from './client.js';

const asMock = makeAnalyticsClient as unknown as ReturnType<typeof vi.fn>;

function mockClient() {
  const client = {
    setSiteId: vi.fn(),
    getEventsList: vi.fn(async () => ({ events: [], total: 0, offset: 0, limit: 0 })),
    getUsers: vi.fn(async () => ({ users: [], total: 0, offset: 0, limit: 0 })),
    getUserEvents: vi.fn(async () => ({ events: [], total: 0, offset: 0, limit: 0 })),
    getRetention: vi.fn(async () => ({ cohorts: [] })),
    getStats: vi.fn(async () => ({ data: [], total: 0 })),
  };
  asMock.mockReturnValue(client);
  return client;
}

function buildProgram(): Command {
  const program = new Command();
  program
    .option('-f, --format <format>', 'Output format')
    .option('--url <url>', 'URL')
    .option('--secret <secret>', 'Secret')
    .option('--site <siteId>', 'Site');
  registerEventsCommand(program);
  registerUsersCommand(program);
  registerRetentionCommand(program);
  registerStatsCommand(program);
  return program;
}

async function run(...args: string[]) {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await buildProgram().parseAsync(['node', 'lm', '-f', 'json', ...args]);
}

afterEach(() => {
  asMock.mockReset();
  vi.restoreAllMocks();
});

describe('users events pagination flags', () => {
  // The parent `users` command declares -l, --offset and --include-bots too, and
  // Commander gives a flag to the first command in the chain that knows it.
  const shapes: [string, string[]][] = [
    ['after the identifier', ['users', 'events', 'abc', '-l', '50', '--offset', '100', '--include-bots']],
    ['before the identifier', ['users', 'events', '-l', '50', '--offset', '100', '--include-bots', 'abc']],
    ['attached values', ['users', 'events', 'abc', '-l50', '--offset=100', '--include-bots']],
    ['long --limit=', ['users', 'events', 'abc', '--limit=50', '--offset', '100', '--include-bots']],
  ];

  it.each(shapes)('reach getUserEvents (%s)', async (_shape, args) => {
    const client = mockClient();
    await run(...args);
    expect(client.getUserEvents).toHaveBeenCalledWith(
      'abc',
      expect.objectContaining({ limit: 50, offset: 100, includeBots: true }),
    );
  });

  it('defaults to 30 rows from the start, bots excluded', async () => {
    const client = mockClient();
    await run('users', 'events', 'abc', '-p', '7d');
    expect(client.getUserEvents).toHaveBeenCalledWith(
      'abc',
      expect.objectContaining({ period: '7d', limit: 30, offset: undefined, includeBots: undefined }),
    );
  });

  it('leaves the users list reading its own flags', async () => {
    const client = mockClient();
    await run('users', '-l', '10', '--offset', '20');
    expect(client.getUsers).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 20 }));
  });
});

describe('integer flags are read in base 10', () => {
  // A bare `parseInt` option parser took the option's default as the radix:
  // events -l 200 = parseInt('200', 50) = NaN, users -l 10 = parseInt('10', 30) = 30,
  // retention -w 12 = parseInt('12', 8) = 10.
  type Method = 'getEventsList' | 'getUsers' | 'getRetention';
  const cases: [string, string[], Method, Record<string, unknown>][] = [
    ['events -l 200', ['events', '-l', '200'], 'getEventsList', { limit: 200 }],
    ['events -l 10', ['events', '-l', '10'], 'getEventsList', { limit: 10 }],
    ['events --offset 100', ['events', '--offset', '100'], 'getEventsList', { limit: 50, offset: 100 }],
    ['events --offset 0', ['events', '--offset', '0'], 'getEventsList', { offset: 0 }],
    ['events, a repeated -l', ['events', '-l', '10', '-l', '20'], 'getEventsList', { limit: 20 }],
    ['events, no flags', ['events'], 'getEventsList', { limit: 50, offset: undefined }],
    ['users -l 10', ['users', '-l', '10'], 'getUsers', { limit: 10 }],
    ['users -l 200', ['users', '-l', '200'], 'getUsers', { limit: 200 }],
    ['users, no flags', ['users'], 'getUsers', { limit: 30, offset: undefined }],
    ['retention -w 12', ['retention', '-w', '12'], 'getRetention', { weeks: 12 }],
    ['retention -w 8', ['retention', '-w', '8'], 'getRetention', { weeks: 8 }],
    ['retention, no flags', ['retention'], 'getRetention', { weeks: 8 }],
  ];

  it.each(cases)('%s', async (_name, args, method, expected) => {
    const client = mockClient();
    await run(...args);
    expect(client[method]).toHaveBeenCalledWith(expect.objectContaining(expected));
  });

  it('stats -l 5', async () => {
    const client = mockClient();
    await run('stats', 'top_pages', '-l', '5');
    expect(client.getStats).toHaveBeenCalledWith('top_pages', expect.objectContaining({ limit: 5 }));
  });

  it('stats without -l leaves the limit to the server', async () => {
    const client = mockClient();
    await run('stats', 'top_pages');
    expect(client.getStats).toHaveBeenCalledWith('top_pages', expect.objectContaining({ limit: undefined }));
  });
});

describe('a value that is not a whole number', () => {
  const bad: [string[], string][] = [
    [['events', '-l', 'abc'], '--limit must be a whole number of at least 1, got "abc".'],
    [['users', '--offset', '1.5'], '--offset must be a whole number, got "1.5".'],
    [['users', 'events', 'abc', '-l', '12abc'], '--limit must be a whole number of at least 1, got "12abc".'],
    [['retention', '-w', 'x'], '--weeks must be a whole number of at least 1, got "x".'],
    [['stats', 'top_pages', '-l', 'NaN'], '--limit must be a whole number of at least 1, got "NaN".'],
    // 0 used to be dropped by the client, so the server silently used its default.
    [['events', '-l', '0'], '--limit must be a whole number of at least 1, got "0".'],
    [['users', 'events', 'abc', '-l', '0'], '--limit must be a whole number of at least 1, got "0".'],
    [['retention', '-w', '0'], '--weeks must be a whole number of at least 1, got "0".'],
    [['stats', 'top_pages', '-l', '0'], '--limit must be a whole number of at least 1, got "0".'],
  ];

  it.each(bad)('%j exits 1 with the JSON envelope and sends nothing', async (args, message) => {
    mockClient();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(run(...args)).rejects.toThrow('exit');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy.mock.calls.map((c) => JSON.parse(c[0] as string))).toEqual([{ error: message }]);
    expect(asMock).not.toHaveBeenCalled();
  });
});
