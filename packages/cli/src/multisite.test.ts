import { describe, it, expect, vi, afterEach } from 'vitest';
import { runPerSite } from './multisite';
import { setCompactMode } from './output';

afterEach(() => {
  setCompactMode(false);
  vi.restoreAllMocks();
});

const table = (result: { n: number }) => ({
  headers: ['n'],
  rows: [[String(result.n)]],
});

describe('runPerSite (R7: multi-site)', () => {
  it('single site: emits the raw result (byte-identical json) and does not exit', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setCompactMode(true);
    await runPerSite(['site_a'], 'json', {
      run: async () => ({ n: 1 }),
      table,
    });
    // exactly the raw result, not a keyed object
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual({ n: 1 });
  });

  it('multiple sites: emits a single json object keyed by site id', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setCompactMode(true);
    await runPerSite(['site_a', 'site_b'], 'json', {
      run: async (siteId) => ({ n: siteId === 'site_a' ? 1 : 2 }),
      table,
    });
    const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(Object.keys(payload)).toEqual(['site_a', 'site_b']);
    expect(payload.site_a).toEqual({ n: 1 });
    expect(payload.site_b).toEqual({ n: 2 });
  });

  it('multiple sites, partial failure: puts failures under "errors" and exits 1', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    setCompactMode(true);
    await expect(
      runPerSite(['site_a', 'site_b'], 'json', {
        run: async (siteId) => {
          if (siteId === 'site_b') throw new Error('boom-b');
          return { n: 1 };
        },
        table,
      }),
    ).rejects.toThrow('exit');
    const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(payload.site_a).toEqual({ n: 1 });
    expect(payload).not.toHaveProperty('site_b');
    expect(payload.errors).toEqual({ site_b: 'boom-b' });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('multiple sites: extracts the server error message into the errors map', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    setCompactMode(true);
    await expect(
      runPerSite(['site_a', 'site_b'], 'json', {
        run: async (siteId) => {
          if (siteId === 'site_b') throw { response: { data: { error: 'Unauthorized' } } };
          return { n: 1 };
        },
        table,
      }),
    ).rejects.toThrow('exit');
    const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(payload.errors).toEqual({ site_b: 'Unauthorized' });
  });

  it('single site: a run() failure propagates to the caller (not caught here)', async () => {
    await expect(
      runPerSite(['site_a'], 'json', {
        run: async () => {
          throw new Error('boom');
        },
        table,
      }),
    ).rejects.toThrow('boom');
  });

  it('multiple sites all succeed: does not exit', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    await runPerSite(['site_a', 'site_b'], 'json', {
      run: async () => ({ n: 1 }),
      table,
    });
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('table mode with multiple sites prints one section per site, with each body', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runPerSite(['site_a', 'site_b'], 'table', {
      run: async (siteId) => ({ n: siteId === 'site_a' ? 11 : 22 }),
      table,
    });
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    // one header line per site
    expect(out).toContain('# site: site_a');
    expect(out).toContain('# site: site_b');
    // and each site's distinct table body actually rendered
    expect(out).toContain('11');
    expect(out).toContain('22');
  });
});
