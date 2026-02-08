import type {
  TrackerConfig,
  ClientEvent,
  PageviewEvent,
  CustomEvent,
  IdentifyEvent,
  ClientContext,
  EventSubtype,
} from '@litemetrics/core';
import { STORAGE_KEY_OPTOUT } from '@litemetrics/core';
import { SessionManager } from './session';
import { Transport } from './transport';
import { AutoTracker, initLinkClickTracking, initButtonClickTracking, initScrollDepthTracking, initRageClickTracking } from './auto';
import { parseUTM, now } from './utils';
import { initAttributeTracking } from './attributes';

function filterSelfReferrer(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  try {
    const refHost = new URL(ref).hostname;
    const curHost = typeof window !== 'undefined' ? window.location.hostname : '';
    return refHost === curHost ? undefined : ref;
  } catch {
    return ref;
  }
}

export interface LitemetricsInstance {
  track(name: string, properties?: Record<string, unknown>, options?: {
    eventSource?: 'auto' | 'manual';
    eventSubtype?: EventSubtype;
    pagePath?: string;
    targetUrlPath?: string;
    elementSelector?: string;
    elementText?: string;
    scrollDepthPct?: number;
  }): void;
  identify(userId: string, traits?: Record<string, unknown>): void;
  page(url?: string, title?: string): void;
  reset(): void;
  opt_out(): void;
  opt_in(): void;
  destroy(): void;
}

export function createTracker(config: TrackerConfig): LitemetricsInstance {
  const {
    siteId,
    endpoint,
    autoTrack = true,
    autoSpa = true,
    debug = false,
    respectDnt = true,
  } = config;

  // Check Do Not Track
  if (respectDnt && typeof navigator !== 'undefined' && navigator.doNotTrack === '1') {
    return createNoopTracker();
  }

  // Check opt-out
  try {
    if (localStorage.getItem(STORAGE_KEY_OPTOUT) === '1') {
      return createNoopTracker();
    }
  } catch {
    // ignore
  }

  const {
    autoOutbound = true,
    autoFileDownloads = true,
    autoScrollDepth = true,
    autoRageClicks = true,
    autoLinkClicks = true,
    autoButtonClicks = true,
  } = config;

  const session = new SessionManager();
  const transport = new Transport({
    endpoint,
    batchSize: config.batchSize,
    flushInterval: config.flushInterval,
    debug,
  });
  let autoTracker: AutoTracker | null = null;
  let cleanupAttributes: (() => void) | null = null;
  const autoCleanups: (() => void)[] = [];
  let optedOut = false;

  function getContext(): ClientContext {
    const ctx: ClientContext = {};
    if (typeof screen !== 'undefined') {
      ctx.screen = { width: screen.width, height: screen.height };
    }
    if (typeof navigator !== 'undefined') {
      ctx.language = navigator.language;
      // Network Information API
      const conn = (navigator as any).connection;
      if (conn) {
        ctx.connection = {
          type: conn.type,
          downlink: conn.downlink,
          effectiveType: conn.effectiveType,
          rtt: conn.rtt,
        };
      }
    }
    if (typeof Intl !== 'undefined') {
      ctx.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    const utm = parseUTM();
    if (utm) ctx.utm = utm;
    return ctx;
  }

  async function sendEvent(event: ClientEvent): Promise<void> {
    if (optedOut) return;
    session.touch();
    transport.send(event);
  }

  async function trackPage(url?: string, title?: string, referrer?: string): Promise<void> {
    const visitorId = await session.getVisitorId();
    const event: PageviewEvent & ClientContext = {
      type: 'pageview',
      siteId,
      timestamp: now(),
      sessionId: session.sessionId,
      visitorId,
      url: url || (typeof location !== 'undefined' ? location.href : ''),
      referrer: filterSelfReferrer(referrer || (typeof document !== 'undefined' ? document.referrer : undefined)),
      title: title || (typeof document !== 'undefined' ? document.title : undefined),
      ...getContext(),
    };
    if (session.userId) event.userId = session.userId;
    sendEvent(event);
  }

  // Auto-track initial page view
  if (autoTrack) {
    trackPage();
  }

  // Auto-track SPA navigation
  if (autoSpa) {
    autoTracker = new AutoTracker((url, ref) => trackPage(url, undefined, ref));
    autoTracker.startSPA();
  }

  // We need a reference to the instance for attribute tracking
  // so we create it first then init attributes
  const instance: LitemetricsInstance = {
    track(name: string, properties?: Record<string, unknown>, options?: {
      eventSource?: 'auto' | 'manual';
      eventSubtype?: EventSubtype;
      pagePath?: string;
      targetUrlPath?: string;
      elementSelector?: string;
      elementText?: string;
      scrollDepthPct?: number;
    }): void {
      session.getVisitorId().then((visitorId) => {
        const event: CustomEvent & ClientContext = {
          type: 'event',
          siteId,
          timestamp: now(),
          sessionId: session.sessionId,
          visitorId,
          name,
          properties,
          eventSource: options?.eventSource ?? 'manual',
          eventSubtype: options?.eventSubtype ?? 'custom',
          pagePath: options?.pagePath,
          targetUrlPath: options?.targetUrlPath,
          elementSelector: options?.elementSelector,
          elementText: options?.elementText,
          scrollDepthPct: options?.scrollDepthPct,
          ...getContext(),
        };
        if (session.userId) event.userId = session.userId;
        sendEvent(event);
      });
    },

    identify(userId: string, traits?: Record<string, unknown>): void {
      session.identify(userId);
      session.getVisitorId().then((visitorId) => {
        const event: IdentifyEvent & ClientContext = {
          type: 'identify',
          siteId,
          timestamp: now(),
          sessionId: session.sessionId,
          visitorId,
          userId,
          traits,
          ...getContext(),
        };
        sendEvent(event);
      });
    },

    page(url?: string, title?: string): void {
      trackPage(url, title);
    },

    reset(): void {
      session.reset();
    },

    opt_out(): void {
      optedOut = true;
      try {
        localStorage.setItem(STORAGE_KEY_OPTOUT, '1');
      } catch {
        // ignore
      }
    },

    opt_in(): void {
      optedOut = false;
      try {
        localStorage.removeItem(STORAGE_KEY_OPTOUT);
      } catch {
        // ignore
      }
    },

    destroy(): void {
      cleanupAttributes?.();
      autoCleanups.forEach((fn) => fn());
      autoTracker?.stop();
      transport.destroy();
    },
  };

  // Initialize data-attribute event tracking
  if (autoTrack && typeof document !== 'undefined') {
    cleanupAttributes = initAttributeTracking(instance);

    // Enhanced auto-tracking
    if (autoLinkClicks || autoOutbound || autoFileDownloads) {
      autoCleanups.push(initLinkClickTracking(instance, {
        trackInternal: autoLinkClicks,
        trackOutbound: autoLinkClicks || autoOutbound,
        trackFileDownloads: autoFileDownloads,
      }));
    }
    if (autoButtonClicks) autoCleanups.push(initButtonClickTracking(instance));
    if (autoScrollDepth) autoCleanups.push(initScrollDepthTracking(instance));
    if (autoRageClicks) autoCleanups.push(initRageClickTracking(instance));
  }

  return instance;
}

function createNoopTracker(): LitemetricsInstance {
  return {
    track() {},
    identify() {},
    page() {},
    reset() {},
    opt_out() {},
    opt_in() {},
    destroy() {},
  };
}
