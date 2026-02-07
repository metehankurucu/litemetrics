import type {
  TrackerConfig,
  ClientEvent,
  PageviewEvent,
  CustomEvent,
  IdentifyEvent,
  ClientContext,
} from '@litemetrics/core';

export interface RNTrackerInstance {
  track(name: string, properties?: Record<string, unknown>): void;
  identify(userId: string, traits?: Record<string, unknown>): void;
  page(screenName: string): void;
  reset(): void;
  destroy(): void;
}

let sessionId: string | null = null;
let visitorId: string | null = null;
let userId: string | null = null;

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createRNTracker(config: TrackerConfig): RNTrackerInstance {
  const { siteId, endpoint, debug = false } = config;

  if (!sessionId) sessionId = generateId();
  if (!visitorId) visitorId = generateId().slice(0, 16);

  const queue: ClientEvent[] = [];
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  function getContext(): ClientContext {
    return {
      timezone:
        typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : undefined,
    };
  }

  function flush() {
    if (queue.length === 0) return;
    const events = queue.splice(0);

    if (debug) {
      console.log('[litemetrics:rn] sending', events.length, 'events');
    }

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    }).catch((err) => {
      if (debug) console.warn('[litemetrics:rn] send failed', err);
      // Push back to queue for retry
      queue.unshift(...events);
    });
  }

  function send(event: ClientEvent) {
    queue.push(event);
    if (queue.length >= (config.batchSize ?? 10)) {
      flush();
    }
  }

  // Start flush timer
  flushTimer = setInterval(flush, config.flushInterval ?? 5000);

  return {
    track(name: string, properties?: Record<string, unknown>) {
      const event: CustomEvent & ClientContext = {
        type: 'event',
        siteId,
        timestamp: Date.now(),
        sessionId: sessionId!,
        visitorId: visitorId!,
        name,
        properties,
        ...getContext(),
      };
      if (userId) (event as any).userId = userId;
      send(event);
    },

    identify(id: string, traits?: Record<string, unknown>) {
      userId = id;
      const event: IdentifyEvent & ClientContext = {
        type: 'identify',
        siteId,
        timestamp: Date.now(),
        sessionId: sessionId!,
        visitorId: visitorId!,
        userId: id,
        traits,
        ...getContext(),
      };
      send(event);
    },

    page(screenName: string) {
      const event: PageviewEvent & ClientContext = {
        type: 'pageview',
        siteId,
        timestamp: Date.now(),
        sessionId: sessionId!,
        visitorId: visitorId!,
        url: screenName,
        title: screenName,
        ...getContext(),
      };
      if (userId) (event as any).userId = userId;
      send(event);
    },

    reset() {
      sessionId = generateId();
      visitorId = generateId().slice(0, 16);
      userId = null;
    },

    destroy() {
      flush();
      if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
      }
    },
  };
}
