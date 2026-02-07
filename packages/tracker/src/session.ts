import {
  SESSION_TIMEOUT,
  STORAGE_KEY_SESSION,
  STORAGE_KEY_VISITOR,
  STORAGE_KEY_LAST_ACTIVE,
  STORAGE_KEY_USER,
} from '@insayt/core';
import { generateId, hashString, getDayString, now } from './utils';

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
}

function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}

export class SessionManager {
  private _sessionId: string;
  private _visitorId: string | null = null;
  private _userId: string | null = null;
  private _hostname: string;

  constructor(hostname?: string) {
    this._hostname = hostname || (typeof location !== 'undefined' ? location.hostname : 'unknown');
    this._sessionId = this._getOrCreateSession();
    this._userId = storageGet(STORAGE_KEY_USER);
  }

  get sessionId(): string {
    return this._sessionId;
  }

  get userId(): string | null {
    return this._userId;
  }

  async getVisitorId(): Promise<string> {
    if (this._visitorId) return this._visitorId;

    const cached = storageGet(STORAGE_KEY_VISITOR);
    const today = getDayString();

    // Visitor ID rotates daily for privacy
    if (cached) {
      const [id, date] = cached.split('|');
      if (date === today) {
        this._visitorId = id;
        return id;
      }
    }

    const id = await this._generateVisitorId();
    this._visitorId = id;
    storageSet(STORAGE_KEY_VISITOR, `${id}|${today}`);
    return id;
  }

  touch(): void {
    storageSet(STORAGE_KEY_LAST_ACTIVE, now().toString());
  }

  identify(userId: string): void {
    this._userId = userId;
    storageSet(STORAGE_KEY_USER, userId);
  }

  reset(): void {
    this._sessionId = generateId();
    this._visitorId = null;
    this._userId = null;
    storageRemove(STORAGE_KEY_SESSION);
    storageRemove(STORAGE_KEY_VISITOR);
    storageRemove(STORAGE_KEY_USER);
    storageRemove(STORAGE_KEY_LAST_ACTIVE);
  }

  private _getOrCreateSession(): string {
    const stored = storageGet(STORAGE_KEY_SESSION);
    const lastActive = storageGet(STORAGE_KEY_LAST_ACTIVE);

    if (stored && lastActive) {
      const elapsed = now() - parseInt(lastActive, 10);
      if (elapsed < SESSION_TIMEOUT) {
        this.touch();
        return stored;
      }
    }

    const id = generateId();
    storageSet(STORAGE_KEY_SESSION, id);
    this.touch();
    return id;
  }

  private async _generateVisitorId(): Promise<string> {
    const components = [
      this._hostname,
      getDayString(),
      typeof navigator !== 'undefined' ? navigator.userAgent : '',
      typeof navigator !== 'undefined' ? navigator.language : '',
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : '',
      typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '',
    ];

    const raw = components.join('|');
    const hash = await hashString(raw);
    return hash.slice(0, 16);
  }
}
