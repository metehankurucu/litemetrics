/**
 * Regression tests for issue #13.
 *
 * `destroy()` used to clear the flush interval and nothing else, so a send whose
 * visitor id was still resolving would fire a request *after* teardown, and the
 * unload listeners stayed registered for the lifetime of the page.
 *
 * In the test suite that escaped request landed on the next test's `fetch` spy,
 * which is what made `tracker.test.ts` flake under load. In an application it is
 * a POST after `@litemetrics/react` unmounts the provider.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Transport } from './transport';
import { destroyOpenTrackers, makeTracker } from './test-utils';
import type { ClientEvent } from '@litemetrics/core';

// jsdom does not implement sendBeacon; define a stub so vi.spyOn can attach.
if (typeof navigator !== 'undefined' && !('sendBeacon' in navigator)) {
  Object.defineProperty(navigator, 'sendBeacon', {
    value: () => true,
    configurable: true,
    writable: true,
  });
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function event(name: string): ClientEvent {
  return {
    type: 'event',
    siteId: 'site_test',
    timestamp: 0,
    sessionId: 's',
    visitorId: 'v',
    name,
  } as ClientEvent;
}

function spyOnNetwork() {
  return {
    fetch: vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 })),
    beacon: vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true),
  };
}

afterEach(() => {
  // Same discipline as tracker.test.ts: tear trackers down while the spies they
  // must not trip are still installed.
  destroyOpenTrackers();
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });
  Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
  try { localStorage.clear(); } catch { /* ignore */ }
  vi.restoreAllMocks();
});

describe('Transport.destroy', () => {
  // R1
  it('dispatches nothing once destroyed', () => {
    const net = spyOnNetwork();
    const transport = new Transport({ endpoint: 'https://x.test/collect', batchSize: 1 });

    transport.destroy();
    transport.send(event('after_destroy'));
    transport.flush();

    expect(net.fetch).not.toHaveBeenCalled();
    expect(net.beacon).not.toHaveBeenCalled();
  });

  // R2
  it('flushes events already queued when destroy is called', () => {
    const net = spyOnNetwork();
    const transport = new Transport({ endpoint: 'https://x.test/collect', batchSize: 10 });

    transport.send(event('queued_a'));
    transport.send(event('queued_b'));
    expect(net.fetch).not.toHaveBeenCalled(); // still batching

    transport.destroy();

    expect(net.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((net.fetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.events.map((e: ClientEvent & { name: string }) => e.name)).toEqual([
      'queued_a',
      'queued_b',
    ]);
  });

  // R3. The target is part of the identity on purpose: removing "pagehide" from
  // document instead of the window would leave the real listener attached, and a
  // [type, handler] pair alone cannot tell those two apart.
  it('unregisters the unload listeners it added, on the target it added them to', () => {
    const added: [EventTarget, string, unknown][] = [];
    const removed: [EventTarget, string, unknown][] = [];
    for (const target of [document, globalThis] as EventTarget[]) {
      vi.spyOn(target, 'addEventListener').mockImplementation((type, handler) => {
        added.push([target, type, handler]);
      });
      vi.spyOn(target, 'removeEventListener').mockImplementation((type, handler) => {
        removed.push([target, type, handler]);
      });
    }

    const transport = new Transport({ endpoint: 'https://x.test/collect' });
    expect(added.map(([, type]) => type)).toEqual(
      expect.arrayContaining(['visibilitychange', 'pagehide']),
    );

    transport.destroy();

    for (const entry of added) {
      expect(removed, `listener for "${entry[1]}" was not removed from its own target`)
        .toContainEqual(entry);
    }
  });

  // R4. Idempotency is observable in three places: no throw, no second dispatch,
  // and no second round of listener removals.
  it('is idempotent', () => {
    const net = spyOnNetwork();
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const transport = new Transport({ endpoint: 'https://x.test/collect', batchSize: 10 });
    transport.send(event('once'));

    transport.destroy();
    const removalsAfterFirstDestroy = removeSpy.mock.calls.length;
    expect(removalsAfterFirstDestroy).toBeGreaterThan(0);

    // Anything arriving between the two calls must not ride out on the second.
    transport.send(event('between_destroys'));
    expect(() => transport.destroy()).not.toThrow();

    expect(net.fetch).toHaveBeenCalledTimes(1);
    expect(removeSpy.mock.calls.length).toBe(removalsAfterFirstDestroy);
    const body = JSON.parse((net.fetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.events.map((e: ClientEvent & { name: string }) => e.name)).toEqual(['once']);
  });

  // R1, the retry path. A fetch dispatched while alive keeps a live .catch();
  // if it rejects after teardown the beacon fallback must not fire.
  it('does not beacon when an in-flight fetch rejects after destroy', async () => {
    let rejectFetch: (reason?: unknown) => void = () => {};
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockReturnValue(new Promise((_, reject) => { rejectFetch = reject; }) as Promise<Response>);
    const beacon = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true);

    const transport = new Transport({ endpoint: 'https://x.test/collect', batchSize: 1 });
    transport.send(event('in_flight'));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    transport.destroy();
    rejectFetch(new Error('network down'));
    for (let i = 0; i < 5; i++) await tick();

    expect(beacon).not.toHaveBeenCalled();
  });
});

describe('createTracker teardown (issue #13)', () => {
  // R1 at the tracker level: this is the exact leak that made tracker.test.ts flake.
  it('sends nothing after destroy, even with a visitor id still resolving', async () => {
    Object.defineProperty(navigator, 'webdriver', { value: undefined, configurable: true });
    const net = spyOnNetwork();

    const tracker = makeTracker({
      siteId: 'site_test',
      endpoint: 'https://x.test/collect',
      autoTrack: false,
      autoSpa: false,
      batchSize: 1,
    });

    // track() resolves the visitor id asynchronously; destroy() runs while that
    // continuation is still pending, guaranteed, since it is the next statement.
    tracker.track('leaked_event');
    tracker.destroy();

    for (let i = 0; i < 20; i++) await tick();

    expect(net.fetch).not.toHaveBeenCalled();
    expect(net.beacon).not.toHaveBeenCalled();
  });

  // R5 in miniature: a live tracker must still deliver, however slow the digest is.
  it('still delivers an event when the visitor id hash is slow', async () => {
    Object.defineProperty(navigator, 'webdriver', { value: undefined, configurable: true });
    const subtle = (globalThis.crypto as Crypto).subtle;
    const realDigest = subtle.digest.bind(subtle);
    vi.spyOn(subtle, 'digest').mockImplementation(async (algo: any, data: any) => {
      for (let i = 0; i < 3; i++) await tick();
      return realDigest(algo, data);
    });
    const net = spyOnNetwork();

    const tracker = makeTracker({
      siteId: 'site_test',
      endpoint: 'https://x.test/collect',
      autoTrack: false,
      autoSpa: false,
      batchSize: 1,
    });

    tracker.track('real_event');
    await vi.waitFor(() => expect(net.fetch).toHaveBeenCalled());

    tracker.destroy();
  });
});
