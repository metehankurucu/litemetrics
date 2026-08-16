import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Both of the things under test here live in the wiring, not in the pure helpers:
// os-version.test.ts proves the resolver returns the right string and
// user-agent.test.ts proves the value is not bot-shaped, but neither proves the
// tracker actually puts them on the wire. That gap is the whole point of this file.

const platform: { OS: string; Version: string | number; constants: Record<string, unknown> } = {
  OS: 'android',
  Version: 37,
  constants: { Model: 'Pixel 7', Brand: 'google', Release: '17' },
};

vi.mock('react-native', () => ({
  get Platform() {
    return platform;
  },
  Dimensions: { get: () => ({ width: 412, height: 915 }) },
  NativeModules: {},
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => 'persisted-visitor'),
    setItem: vi.fn(async () => {}),
    removeItem: vi.fn(async () => {}),
  },
}));

const { createRNTracker } = await import('./tracker');
const { SDK_VERSION } = await import('./user-agent');

function lastRequest() {
  const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
  const [, init] = calls[calls.length - 1];
  return { headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
}

/** The tracker flushes on a timer or at batchSize; one event with batchSize 1 sends now. */
async function sendOne(overrides: Record<string, unknown> = {}) {
  const tracker = createRNTracker({
    siteId: 'site_test',
    endpoint: 'https://collect.test/api/collect',
    batchSize: 1,
    ...overrides,
  } as never);
  tracker.track('probe');
  // send() awaits the persisted-visitorId promise before queueing.
  await vi.waitFor(() => {
    expect(globalThis.fetch).toHaveBeenCalled();
  });
  tracker.destroy();
  return lastRequest();
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => ({ ok: true })) as never;
  platform.OS = 'android';
  platform.Version = 37;
  platform.constants = { Model: 'Pixel 7', Brand: 'google', Release: '17' };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createRNTracker request shape', () => {
  it('sends the SDK User-Agent, so Android is not filtered as an OkHttp bot', async () => {
    const { headers } = await sendOne();
    expect(headers['User-Agent']).toBe(`litemetrics-react-native/${SDK_VERSION} (android)`);
  });

  it('sends the Android marketing release as osVersion, not the API level', async () => {
    const { body } = await sendOne();
    expect(body.events[0].mobile.osVersion).toBe('17');
    expect(body.events[0].mobile.platform).toBe('android');
  });

  it('labels the API level when the release is unavailable', async () => {
    platform.constants = { Model: 'Pixel 7', Brand: 'google' };
    const { body } = await sendOne();
    expect(body.events[0].mobile.osVersion).toBe('API 37');
  });

  it('sends the iOS version unchanged and the iOS User-Agent', async () => {
    platform.OS = 'ios';
    platform.Version = '17.4';
    platform.constants = {};
    const { headers, body } = await sendOne();
    expect(headers['User-Agent']).toBe(`litemetrics-react-native/${SDK_VERSION} (ios)`);
    expect(body.events[0].mobile.osVersion).toBe('17.4');
  });

  it('keeps sending Content-Type alongside the new header', async () => {
    const { headers } = await sendOne();
    expect(headers['Content-Type']).toBe('application/json');
  });
});
