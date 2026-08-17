/**
 * Regression tests for the provider's tracker lifetime.
 *
 * `LitemetricsProvider` destroys its tracker when it unmounts, and since
 * litemetrics#13 a destroyed tracker is permanently inert. React StrictMode
 * mounts, unmounts and remounts the same component in development, so a tracker
 * captured once would leave every consumer holding a dead instance: the app
 * would report its first pageview and then go silent, with no error anywhere.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { StrictMode, act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LitemetricsProvider, useLitemetricsContext } from './context';
import { useLitemetrics, usePageView, useTrackEvent } from './hooks';

let captured: ReturnType<typeof useLitemetrics> | null = null;

function Consumer() {
  captured = useLitemetrics();
  return null;
}

// The shape that matters most: a child that tracks from its own mount effect.
// Child effects run before the parent's, so this is the case a provider that
// gates on its own lifecycle is most likely to get wrong.
function TrackOnMount() {
  useTrackEvent('mount_event');
  return null;
}

function PageOnMount() {
  usePageView('/tracked-path');
  return null;
}

let capturedContext: ReturnType<typeof useLitemetricsContext> | null = null;

function ContextConsumer() {
  capturedContext = useLitemetricsContext();
  return null;
}

// jsdom does not implement sendBeacon; define a stub so vi.spyOn can attach.
if (typeof navigator !== 'undefined' && !('sendBeacon' in navigator)) {
  Object.defineProperty(navigator, 'sendBeacon', {
    value: () => true,
    configurable: true,
    writable: true,
  });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // A real browser does not set this; without it the tracker short-circuits to
  // its no-op instance and every assertion below would pass vacuously.
  Object.defineProperty(navigator, 'webdriver', { value: undefined, configurable: true });
  try { localStorage.clear(); } catch { /* ignore */ }
  captured = null;
  capturedContext = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function mount(children: ReactNode, strict: boolean) {
  const tree = (
    <LitemetricsProvider
      siteId="site_test"
      endpoint="https://x.test/collect"
      batchSize={1}
      autoPageView={false}
    >
      {children}
    </LitemetricsProvider>
  );
  await act(async () => root.render(strict ? <StrictMode>{tree}</StrictMode> : tree));
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 25; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

describe('LitemetricsProvider tracker lifetime', () => {
  it('still delivers events after a StrictMode remount', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    await mount(<Consumer />, true);
    const callsAfterMount = fetchSpy.mock.calls.length;

    captured!.track('after_strictmode_remount');
    await settle();

    expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });

  it('delivers events under a normal mount too', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    await mount(<Consumer />, false);
    captured!.track('normal_mount');
    await settle();

    expect(fetchSpy).toHaveBeenCalled();
  });

  // StrictMode runs the mount effect twice, but the remount cancels the deferred
  // teardown, so exactly one tracker is ever built and its auto pageview is
  // reported once. Pinned because a change on either side could double it.
  it('does not duplicate the auto pageview under StrictMode', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    await act(async () =>
      root.render(
        <StrictMode>
          <LitemetricsProvider siteId="site_test" endpoint="https://x.test/collect" batchSize={1} autoPageView>
            <div />
          </LitemetricsProvider>
        </StrictMode>,
      ),
    );
    await settle();

    const pageviews = fetchSpy.mock.calls
      .flatMap((call) => JSON.parse((call[1] as RequestInit).body as string).events)
      .filter((e: { type: string }) => e.type === 'pageview');
    expect(pageviews).toHaveLength(1);
  });

  // Both hooks this package ships track from a mount effect, and a child's effect
  // runs before its parent's. A provider that decides "we are gone" in its own
  // cleanup therefore sees the child's second-pass effect land in the window
  // between that cleanup and its own remount.
  it('delivers events that useTrackEvent fires from a child mount effect under StrictMode', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    await mount(<TrackOnMount />, true);
    await settle();

    const events = fetchSpy.mock.calls
      .flatMap((call) => JSON.parse((call[1] as RequestInit).body as string).events)
      .filter((e: { name?: string }) => e.name === 'mount_event');
    expect(events.length).toBeGreaterThan(0);
  });

  it('delivers pageviews that usePageView fires from a child mount effect under StrictMode', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    await mount(<PageOnMount />, true);
    await settle();

    const events = fetchSpy.mock.calls
      .flatMap((call) => JSON.parse((call[1] as RequestInit).body as string).events)
      .filter((e: { type: string }) => e.type === 'pageview');
    expect(events.length).toBeGreaterThan(0);
  });

  // destroy() on the context tracker has to stop for good. Resolving lazily means
  // the obvious implementation would just build a replacement on the next call.
  it('stays stopped after the context tracker is destroyed directly', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    await mount(<ContextConsumer />, false);
    await settle();
    fetchSpy.mockClear();

    capturedContext!.tracker.destroy();
    capturedContext!.tracker.track('after_context_destroy');
    await settle();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stops sending once the provider unmounts for real', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true);

    await mount(<Consumer />, false);
    const handle = captured!;
    await act(async () => root.unmount());
    root = createRoot(container); // afterEach unmounts again; keep it valid

    // Teardown is deferred by a task so a StrictMode remount can cancel it, so
    // the guarantee is "once teardown has settled", not "in the same tick as the
    // unmount". A handle deliberately held across unmount and fired within that
    // one task can still send; losing every mount-effect event in every
    // StrictMode session is the far worse trade.
    await settle();
    fetchSpy.mockClear();
    beaconSpy.mockClear();

    handle.track('after_unmount');
    await settle();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beaconSpy).not.toHaveBeenCalled();
  });
});
