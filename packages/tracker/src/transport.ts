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

  constructor(options: TransportOptions) {
    this.endpoint = options.endpoint;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.flushInterval = options.flushInterval ?? DEFAULT_FLUSH_INTERVAL;
    this.debug = options.debug ?? false;

    this._startTimer();
    this._setupUnload();
  }

  send(event: ClientEvent): void {
    this.queue.push(event);
    if (this.queue.length >= this.batchSize) {
      this.flush();
    }
  }

  flush(): void {
    if (this.queue.length === 0) return;
    const events = this.queue.splice(0);
    this._dispatch(events);
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
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
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        // Retry once with sendBeacon
        this._beacon(body);
      });
    } else {
      this._beacon(body);
    }
  }

  private _beacon(body: string): void {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
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
      if (this.queue.length === 0) return;
      const payload: CollectPayload = { events: this.queue.splice(0) };
      const body = JSON.stringify(payload);
      // sendBeacon is more reliable during page unload
      this._beacon(body);
    };

    // visibilitychange + pagehide is the most reliable combo
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        onUnload();
      }
    });

    if (typeof addEventListener !== 'undefined') {
      addEventListener('pagehide', onUnload);
    }
  }
}
