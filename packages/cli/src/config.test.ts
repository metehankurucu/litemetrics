import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// Force the rc-file read to fail so config resolution depends only on flags/env.
vi.mock('fs', () => ({
  readFileSync: () => {
    throw new Error('no rc file');
  },
}));

import { loadConfig } from './config';

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
