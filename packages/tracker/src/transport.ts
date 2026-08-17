import type { ClientEvent, CollectPayload } from '@litemetrics/core';
import { DEFAULT_BATCH_SIZE, DEFAULT_FLUSH_INTERVAL } from '@litemetrics/core';

export interface TransportOptions {
  endpoint: string;
  batchSize?: number;
  flushInterval?: number;
  debug?: boolean;
}

export class Transport {
  private queue: ClientEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private endpoint: string;
  private batchSize: number;
  private flushInterval: number;
  private debug: boolean;
  private destroyed = false;
  private unloadCleanups: (() => void)[] = [];

  constructor(options: TransportOptions) {
    this.endpoint = options.endpoint;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.flushInterval = options.flushInterval ?? DEFAULT_FLUSH_INTERVAL;
    this.debug = options.debug ?? false;

    this._startTimer();
    this._setupUnload();
  }

  send(event: ClientEvent): void {
    // A send whose visitor id was still resolving when destroy() ran must not
    // reach the network: the tracker is torn down, and the caller (an unmounted
    // provider, a host app tearing the SDK down) is no longer expecting traffic.
    if (this.destroyed) return;
    this.queue.push(event);
    if (this.queue.length >= this.batchSize) {
      this.flush();
    }
  }

  flush(): void {
    if (this.destroyed || this.queue.length === 0) return;
    const events = this.queue.splice(0);
    this._dispatch(events);
  }

  destroy(): void {
    if (this.destroyed) return;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Deliver what is already queued, then stop accepting anything new.
    this.flush();
    this.destroyed = true;
    // Detach the list first: a cleanup that throws must not strand the rest,
    // since the guard above makes a second destroy() a no-op.
    const cleanups = this.unloadCleanups;
    this.unloadCleanups = [];
    cleanups.forEach((fn) => fn());
  }

  private _dispatch(events: ClientEvent[]): void {
    const payload: CollectPayload = { events };
    const body = JSON.stringify(payload);

    if (this.debug) {
      console.log('[litemetrics] sending', events.length, 'events', events);
    }

    // Try fetch first, fall back to sendBeacon
    if (typeof fetch !== 'undefined') {
      fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body,
        keepalive: true,
        credentials: 'omit',
      }).catch(() => {
        // Retry once with sendBeacon, unless we were torn down while the request
        // was in flight: a destroyed transport emits nothing, and a rejection can
        // arrive long after destroy(). The cost is that a failed teardown flush
        // is not retried; an escaped request is the worse of the two.
        if (this.destroyed) return;
        this._beacon(body);
      });
    } else {
      this._beacon(body);
    }
  }

  private _beacon(body: string): void {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'text/plain' });
      navigator.sendBeacon(this.endpoint, blob);
    }
  }

  private _startTimer(): void {
    if (typeof setInterval !== 'undefined') {
      this.timer = setInterval(() => this.flush(), this.flushInterval);
    }
  }

  private _setupUnload(): void {
    if (typeof document === 'undefined') return;

    const onUnload = () => {
      if (this.destroyed || this.queue.length === 0) return;
      const payload: CollectPayload = { events: this.queue.splice(0) };
      const body = JSON.stringify(payload);
      // sendBeacon is more reliable during page unload
      this._beacon(body);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        onUnload();
      }
    };

    // visibilitychange + pagehide is the most reliable combo. Both handlers are
    // kept referenceable so destroy() can unregister them; otherwise every
    // tracker instance leaks two listeners for the lifetime of the page.
    document.addEventListener('visibilitychange', onVisibilityChange);
    this.unloadCleanups.push(() =>
      document.removeEventListener('visibilitychange', onVisibilityChange),
    );

    if (typeof addEventListener !== 'undefined') {
      addEventListener('pagehide', onUnload);
      this.unloadCleanups.push(() => removeEventListener('pagehide', onUnload));
    }
  }
}
