import { describe, it, expect, afterEach, vi } from 'vitest';
import type { TrackerConfig } from '@litemetrics/core';
import { createTracker, type LitemetricsInstance } from './tracker';

// jsdom doesn't implement sendBeacon; define a stub so vi.spyOn can attach.
if (typeof navigator !== 'undefined' && !('sendBeacon' in navigator)) {
  Object.defineProperty(navigator, 'sendBeacon', {
    value: () => true,
    configurable: true,
    writable: true,
  });
}

const openTrackers: LitemetricsInstance[] = [];

// Every tracker a test creates goes through this, so afterEach can tear it down
// even when the test throws before its own cleanup.
function track(config: TrackerConfig): LitemetricsInstance {
  const tracker = createTracker(config);
  openTrackers.push(tracker);
  return tracker;
}

afterEach(() => {
  // Destroy before restoring mocks. A send whose visitor id is still resolving
  // would otherwise land on the NEXT test's fetch spy - the leak behind #13.
  openTrackers.splice(0).forEach((tracker) => tracker.destroy());
  // Reset webdriver flag between tests
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });
  // Clear opt-out / DNT state so previous tests don't leak into the next.
  try { localStorage.clear(); } catch { /* ignore */ }
  Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
  vi.restoreAllMocks();
});

describe('createTracker - webdriver short-circuit', () => {
  it('returns a no-op tracker when navigator.webdriver === true', async () => {
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true });

    // Spy on fetch (real tracker calls fetch first via Transport) and sendBeacon
    // (fallback / unload path). A no-op tracker must call neither.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const sendBeacon = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true);

    // batchSize: 1 forces every event to flush immediately, so the spies catch
    // any send the real tracker would do, exposing absence of the short-circuit.
    const tracker = track({
      siteId: 'site_test',
      endpoint: 'https://x.test/collect',
      batchSize: 1,
    });

    // No-op tracker still has the API but track() does nothing.
    tracker.track('test_event');
    tracker.page('/foo');

    // Let any pending microtasks (e.g. async getVisitorId chains) settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('creates a real tracker when navigator.webdriver is false', () => {
    Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });

    const tracker = track({
      siteId: 'site_test',
      endpoint: 'https://x.test/collect',
      autoTrack: false,
      autoSpa: false,
    });

    expect(typeof tracker.track).toBe('function');
    expect(typeof tracker.identify).toBe('function');
    tracker.opt_out();
    expect(() => tracker.track('x')).not.toThrow();
  });

  it('creates a real tracker when navigator.webdriver is undefined (real browser)', async () => {
    // Most real browsers do not set this property at all - simulate that.
    Object.defineProperty(navigator, 'webdriver', { value: undefined, configurable: true });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    const tracker = track({
      siteId: 'site_test',
      endpoint: 'https://x.test/collect',
      autoTrack: false,
      autoSpa: false,
      batchSize: 1,
    });

    tracker.track('real_event');
    // The send completes only after getVisitorId() resolves, which awaits
    // crypto.subtle.digest on the threadpool - one macrotask when the machine is
    // idle, more when it is loaded. Wait for the flush itself, not for a tick.
    await vi.waitFor(() => {
      // Real tracker fires at least one network call (no-op tracker fires zero).
      const beaconCalls = (navigator.sendBeacon as unknown as { mock?: { calls: unknown[] } }).mock?.calls?.length ?? 0;
      expect(fetchSpy.mock.calls.length + beaconCalls).toBeGreaterThan(0);
    });
    expect(() => tracker.destroy()).not.toThrow();
  });

  it('returns a no-op tracker when DNT=1 even if navigator.webdriver is also true', async () => {
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true });
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const sendBeacon = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true);

    const tracker = track({
      siteId: 'site_test',
      endpoint: 'https://x.test/collect',
      batchSize: 1,
    });
    tracker.track('blocked');
    tracker.page('/blocked');
    await new Promise((r) => setTimeout(r, 0));

    // Either short-circuit (DNT or webdriver) prevents network IO.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();

    // Reset DNT for subsequent tests.
    Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
  });
});
