import { describe, it, expect, afterEach, vi } from 'vitest';
import { createTracker } from './tracker';

// jsdom doesn't implement sendBeacon; define a stub so vi.spyOn can attach.
if (typeof navigator !== 'undefined' && !('sendBeacon' in navigator)) {
  Object.defineProperty(navigator, 'sendBeacon', {
    value: () => true,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  // Reset webdriver flag between tests
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });
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
    const tracker = createTracker({
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

    const tracker = createTracker({
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
});
