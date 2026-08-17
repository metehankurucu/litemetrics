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
import { LitemetricsProvider } from './context';
import { useLitemetrics } from './hooks';

let captured: ReturnType<typeof useLitemetrics> | null = null;

function Consumer() {
  captured = useLitemetrics();
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

  it('stops sending once the provider unmounts for real', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true);

    await mount(<Consumer />, false);
    const handle = captured!;
    await act(async () => root.unmount());
    root = createRoot(container); // afterEach unmounts again; keep it valid
    fetchSpy.mockClear();
    beaconSpy.mockClear();

    handle.track('after_unmount');
    await settle();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beaconSpy).not.toHaveBeenCalled();
  });
});
