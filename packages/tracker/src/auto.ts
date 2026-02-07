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
        const referrer = this.lastUrl;
        this.lastUrl = current;
        this.onPage(current, referrer);
      }
    }, 0);
  }
}
