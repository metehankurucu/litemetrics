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

import { registerUsersCommand } from './commands/users';
import { makeAnalyticsClient } from './client.js';

const asMock = makeAnalyticsClient as unknown as ReturnType<typeof vi.fn>;

function mockClient() {
  const client = {
    setSiteId: vi.fn(),
    getUsers: vi.fn(async () => ({ users: [], total: 0, offset: 0, limit: 0 })),
    getUserEvents: vi.fn(async () => ({ events: [], total: 0, offset: 0, limit: 0 })),
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
  registerUsersCommand(program);
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
