import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// Force the rc-file read to fail so config resolution depends only on flags/env.
vi.mock('fs', () => ({
  readFileSync: () => {
    throw new Error('no rc file');
  },
}));

// Stub the network client so resolveSiteIds' auto-resolve is deterministic.
vi.mock('./client.js', () => ({
  makeSitesClient: vi.fn(),
}));

import { loadConfig, splitSiteIds, resolveSiteIds } from './config';
import { makeSitesClient } from './client.js';

const asMock = makeSitesClient as unknown as ReturnType<typeof vi.fn>;
const withSites = (sites: { siteId: string; name: string }[]) =>
  asMock.mockReturnValue({ listSites: async () => ({ sites }) });

describe('loadConfig (R5: config errors respect JSON mode)', () => {
  const origUrl = process.env.LITEMETRICS_URL;
  const origSecret = process.env.LITEMETRICS_ADMIN_SECRET;

  beforeEach(() => {
    delete process.env.LITEMETRICS_URL;
    delete process.env.LITEMETRICS_ADMIN_SECRET;
  });

  afterEach(() => {
    process.env.LITEMETRICS_URL = origUrl;
    process.env.LITEMETRICS_ADMIN_SECRET = origSecret;
    vi.restoreAllMocks();
  });

  it('emits a JSON error envelope on stderr when url is missing and format is json', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    expect(() => loadConfig({}, 'json')).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    const payload = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(payload.error).toContain('URL');
  });

  it('emits a JSON error envelope when admin secret is missing and format is json', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    expect(() => loadConfig({ url: 'https://a.test' }, 'json')).toThrow('exit');
    const payload = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(payload.error.toLowerCase()).toContain('secret');
  });

  it('prints a prose error (no JSON) in table mode', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    expect(() => loadConfig({}, 'table')).toThrow('exit');
    const line = errSpy.mock.calls[0][0] as string;
    expect(line.startsWith('Error: ')).toBe(true);
    expect(() => JSON.parse(line)).toThrow();
  });

  it('returns a resolved config when url and secret are provided', () => {
    const config = loadConfig({ url: 'https://a.test', adminSecret: 'sk_x', siteId: 'site_1' }, 'json');
    expect(config).toEqual({ url: 'https://a.test', adminSecret: 'sk_x', siteId: 'site_1' });
  });
});

describe('splitSiteIds (R7)', () => {
  it('splits a comma list and trims whitespace', () => {
    expect(splitSiteIds('a, b ,c')).toEqual(['a', 'b', 'c']);
  });
  it('returns a single-element array for one id', () => {
    expect(splitSiteIds('site_1')).toEqual(['site_1']);
  });
  it('returns [] for undefined', () => {
    expect(splitSiteIds(undefined)).toEqual([]);
  });
  it('drops empty segments', () => {
    expect(splitSiteIds('a,,b,')).toEqual(['a', 'b']);
  });
});

describe('resolveSiteIds (R7)', () => {
  const cfg = { url: 'https://a.test', adminSecret: 'sk_x' };

  afterEach(() => {
    asMock.mockReset();
    vi.restoreAllMocks();
  });

  it('returns an explicit comma list without calling the server', async () => {
    expect(await resolveSiteIds({ ...cfg, siteId: 'a,b' }, 'json')).toEqual(['a', 'b']);
    expect(asMock).not.toHaveBeenCalled();
  });

  it('auto-resolves the sole site when none is configured', async () => {
    withSites([{ siteId: 's1', name: 'One' }]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await resolveSiteIds(cfg, 'json')).toEqual(['s1']);
  });

  it('emits a JSON envelope and exits when no sites exist', async () => {
    withSites([]);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    await expect(resolveSiteIds(cfg, 'json')).rejects.toThrow('exit');
    expect(JSON.parse(errSpy.mock.calls[0][0] as string).error).toContain('No sites');
  });

  it('emits an envelope with the site-id suggestions when multiple sites exist', async () => {
    withSites([
      { siteId: 's1', name: 'One' },
      { siteId: 's2', name: 'Two' },
    ]);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    await expect(resolveSiteIds(cfg, 'json')).rejects.toThrow('exit');
    const payload = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(payload.suggestions).toEqual(['s1', 's2']);
  });
});
