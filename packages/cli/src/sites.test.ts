import { describe, it, expect, vi, afterEach } from 'vitest';
import { Command } from 'commander';

// Stub config + network so the sites commands run without a server or rc file.
vi.mock('./config.js', () => ({
  loadConfig: vi.fn(() => ({ url: 'https://x.test', adminSecret: 'sk_x' })),
}));
vi.mock('./client.js', () => ({
  makeSitesClient: vi.fn(),
}));

import { registerSitesCommand } from './commands/sites';
import { makeSitesClient } from './client.js';

const asMock = makeSitesClient as unknown as ReturnType<typeof vi.fn>;

function buildProgram(): Command {
  const program = new Command();
  program
    .option('-f, --format <format>', 'Output format')
    .option('--url <url>', 'URL')
    .option('--secret <secret>', 'Secret');
  registerSitesCommand(program);
  return program;
}

afterEach(() => {
  asMock.mockReset();
  vi.restoreAllMocks();
});

describe('sites mutations route through output() (R8)', () => {
  it('delete under -f csv emits a single structured CSV row, never prose', async () => {
    asMock.mockReturnValue({ deleteSite: async () => ({ ok: true }) });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await buildProgram().parseAsync(['node', 'lm', '-f', 'csv', 'sites', 'delete', 'site_1']);

    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toBe('Site ID,Deleted\nsite_1,true');
    // guard against regressing to the old prose form
    expect(out).not.toContain('Site deleted');
  });

  it('create under -f csv emits the header + one row of the new site', async () => {
    asMock.mockReturnValue({
      createSite: async () => ({
        site: { siteId: 'site_new', name: 'My Site', secretKey: 'sk_live_123' },
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await buildProgram().parseAsync([
      'node',
      'lm',
      '-f',
      'csv',
      'sites',
      'create',
      '-n',
      'My Site',
    ]);

    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toBe('Site ID,Name,Secret Key\nsite_new,My Site,sk_live_123');
  });

  it('update under -f csv emits a structured row, never prose', async () => {
    asMock.mockReturnValue({
      updateSite: async () => ({ site: { siteId: 'site_1', name: 'Renamed' } }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await buildProgram().parseAsync([
      'node',
      'lm',
      '-f',
      'csv',
      'sites',
      'update',
      'site_1',
      '-n',
      'Renamed',
    ]);

    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toBe('Site ID,Name\nsite_1,Renamed');
    expect(out).not.toContain('Site updated');
  });

  it('regenerate under -f csv emits a structured row with the new secret', async () => {
    asMock.mockReturnValue({
      regenerateSecret: async () => ({ site: { siteId: 'site_1', secretKey: 'sk_live_new' } }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await buildProgram().parseAsync([
      'node',
      'lm',
      '-f',
      'csv',
      'sites',
      'regenerate',
      'site_1',
    ]);

    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toBe('Site ID,Secret Key\nsite_1,sk_live_new');
    expect(out).not.toContain('Secret regenerated');
  });

  it('delete under -f json emits the raw result object', async () => {
    asMock.mockReturnValue({ deleteSite: async () => ({ ok: true }) });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await buildProgram().parseAsync(['node', 'lm', '-f', 'json', 'sites', 'delete', 'site_1']);

    const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(payload).toEqual({ ok: true });
  });
});
