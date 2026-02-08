import type { LitemetricsInstance } from './tracker';

export type PageCallback = (url: string, referrer?: string) => void;

export class AutoTracker {
  private onPage: PageCallback;
  private lastUrl: string = '';
  private originalPushState: typeof history.pushState | null = null;
  private originalReplaceState: typeof history.replaceState | null = null;

  constructor(onPage: PageCallback) {
    this.onPage = onPage;
  }

  startSPA(): void {
    if (typeof history === 'undefined' || typeof addEventListener === 'undefined') return;

    this.lastUrl = location.href;

    // Monkey-patch pushState and replaceState
    this.originalPushState = history.pushState.bind(history);
    this.originalReplaceState = history.replaceState.bind(history);

    history.pushState = (...args: Parameters<typeof history.pushState>) => {
      this.originalPushState!(...args);
      this._onNavigation();
    };

    history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
      this.originalReplaceState!(...args);
      this._onNavigation();
    };

    addEventListener('popstate', () => this._onNavigation());
  }

  stop(): void {
    if (this.originalPushState) {
      history.pushState = this.originalPushState;
    }
    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState;
    }
  }

  private _onNavigation(): void {
    // Small delay to let the URL update
    setTimeout(() => {
      const current = location.href;
      if (current !== this.lastUrl) {
        this.lastUrl = current;
        this.onPage(current, undefined);
      }
    }, 0);
  }
}

// ─── Outbound Link Tracking ─────────────────────────────────

const FILE_EXTENSIONS = /\.(pdf|zip|doc|docx|xls|xlsx|csv|mp3|mp4|dmg|exe|rar|7z|gz|tar)$/i;

function toPath(url: URL): string {
  return url.pathname || '/';
}

function getElementSelector(el: HTMLElement | null): string | undefined {
  if (!el) return undefined;
  if (el.id) return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const rawClass = typeof el.className === 'string' ? el.className : '';
  const className = rawClass.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
  return className ? `${tag}.${className}` : tag;
}

function getElementText(el: HTMLElement | null): string | undefined {
  if (!el) return undefined;
  const text = (el.innerText || '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, 80) : undefined;
}

export function initLinkClickTracking(
  instance: LitemetricsInstance,
  options: { trackInternal: boolean; trackOutbound: boolean; trackFileDownloads: boolean },
): () => void {
  function handleClick(e: MouseEvent) {
    const link = (e.target as HTMLElement)?.closest?.('a') as HTMLAnchorElement | null;
    if (!link) return;

    const href = link.href;
    if (!href || href.startsWith('javascript:') || href.startsWith('#')) return;

    try {
      const url = new URL(href, location.href);
      const isOutbound = !!url.hostname && url.hostname !== location.hostname;
      const match = url.pathname.match(FILE_EXTENSIONS);

      if (match && options.trackFileDownloads) {
        instance.track('File Download', { extension: match[1].toLowerCase() }, {
          eventSource: 'auto',
          eventSubtype: 'file_download',
          pagePath: location.pathname || '/',
          targetUrlPath: toPath(url),
        });
        return;
      }

      if (isOutbound && !options.trackOutbound) return;
      if (!isOutbound && !options.trackInternal) return;

      instance.track(isOutbound ? 'Outbound Link' : 'Link Click', undefined, {
        eventSource: 'auto',
        eventSubtype: isOutbound ? 'outbound_click' : 'link_click',
        pagePath: location.pathname || '/',
        targetUrlPath: toPath(url),
      });
    } catch {
      // ignore malformed URLs
    }
  }

  document.addEventListener('click', handleClick, true);
  return () => document.removeEventListener('click', handleClick, true);
}

// ─── File Download Tracking ─────────────────────────────────

export function initButtonClickTracking(instance: LitemetricsInstance): () => void {
  function handleClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const button = target.closest('button, [role="button"], input[type="button"], input[type="submit"]') as HTMLElement | null;
    if (!button) return;
    if (button.closest('a')) return;

    instance.track('Button Click', undefined, {
      eventSource: 'auto',
      eventSubtype: 'button_click',
      pagePath: location.pathname || '/',
      elementSelector: getElementSelector(button),
      elementText: getElementText(button),
    });
  }

  document.addEventListener('click', handleClick, true);
  return () => document.removeEventListener('click', handleClick, true);
}

// ─── Scroll Depth Tracking ─────────────────────────────────

export function initScrollDepthTracking(instance: LitemetricsInstance): () => void {
  const milestones = [25, 50, 75, 90];
  const reached = new Set<number>();
  let lastPath = location.pathname;
  let ticking = false;

  function check() {
    ticking = false;

    // Reset on navigation
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      reached.clear();
    }

    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    const viewHeight = window.innerHeight;
    const scrollable = docHeight - viewHeight;
    if (scrollable <= 0) return;

    const pct = (scrollTop / scrollable) * 100;
    for (const m of milestones) {
      if (pct >= m && !reached.has(m)) {
        reached.add(m);
        instance.track('Scroll Depth', { depth: `${m}%` }, {
          eventSource: 'auto',
          eventSubtype: 'scroll_depth',
          pagePath: location.pathname || '/',
          scrollDepthPct: m,
        });
      }
    }
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(check);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  return () => window.removeEventListener('scroll', onScroll);
}

// ─── Rage Click Detection ──────────────────────────────────

export function initRageClickTracking(instance: LitemetricsInstance): () => void {
  const clicks: { time: number; x: number; y: number }[] = [];
  const THRESHOLD = 3;
  const TIME_WINDOW = 800;
  const DISTANCE = 30; // pixels

  function handleClick(e: MouseEvent) {
    const now = Date.now();
    clicks.push({ time: now, x: e.clientX, y: e.clientY });

    // Remove old clicks outside window
    while (clicks.length > 0 && now - clicks[0].time > TIME_WINDOW) {
      clicks.shift();
    }

    if (clicks.length >= THRESHOLD) {
      // Check if all clicks are close together
      const first = clicks[0];
      const allClose = clicks.every(
        (c) => Math.abs(c.x - first.x) < DISTANCE && Math.abs(c.y - first.y) < DISTANCE
      );

      if (allClose) {
        const target = e.target as HTMLElement | null;
        const tagName = target?.tagName?.toLowerCase() || 'unknown';
        const text = (target?.innerText || '').slice(0, 50).trim();
        instance.track('Rage Click', { element: tagName, text: text || undefined }, {
          eventSource: 'auto',
          eventSubtype: 'rage_click',
          pagePath: location.pathname || '/',
        });
        clicks.length = 0; // Reset after detection
      }
    }
  }

  document.addEventListener('click', handleClick, true);
  return () => document.removeEventListener('click', handleClick, true);
}
