import { Platform, Dimensions } from 'react-native';
import type {
  TrackerConfig,
  ClientEvent,
  PageviewEvent,
  CustomEvent,
  IdentifyEvent,
  ClientContext,
} from '@litemetrics/core';

export interface RNTrackerConfig extends Omit<TrackerConfig, 'autoTrack' | 'autoSpa'> {
  appVersion?: string;
  appBuild?: string;
}

export interface RNTrackerInstance {
  track(name: string, properties?: Record<string, unknown>): void;
  identify(userId: string, traits?: Record<string, unknown>): void;
  page(screenName: string): void;
  reset(): void;
  destroy(): void;
}

const SDK_NAME = 'litemetrics-react-native';
const SDK_VERSION = '0.2.2';

let sessionId: string | null = null;
let visitorId: string | null = null;
let userId: string | null = null;
let visitorIdLoaded = false;

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

import AsyncStorage from '@react-native-async-storage/async-storage';

const VISITOR_KEY = '@litemetrics_vid';

async function loadVisitorId(): Promise<void> {
  if (visitorIdLoaded) return;
  visitorIdLoaded = true;

  if (!AsyncStorage) return;
  try {
    const stored = await AsyncStorage.getItem(VISITOR_KEY);
    if (stored) {
      visitorId = stored;
    } else if (visitorId) {
      await AsyncStorage.setItem(VISITOR_KEY, visitorId);
    }
  } catch {}
}

export function createRNTracker(config: RNTrackerConfig): RNTrackerInstance {
  const { siteId, endpoint, debug = false } = config;

  // Always generate a fresh sessionId per app launch
  sessionId = generateId();
  // Generate visitorId if not already set (will be overwritten by AsyncStorage if available)
  if (!visitorId) visitorId = generateId().slice(0, 16);

  // Load persisted visitorId — events are gated behind this promise
  const readyPromise = loadVisitorId();

  const queue: ClientEvent[] = [];
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  function getContext(): ClientContext {
    const screen = Dimensions.get('screen');
    const platform = Platform.OS as 'ios' | 'android';
    const osVersion = String(Platform.Version);

    let deviceModel: string | undefined;
    let deviceBrand: string | undefined;
    if (Platform.OS === 'android') {
      const constants = Platform.constants as any;
      deviceModel = constants?.Model;
      deviceBrand = constants?.Brand;
    } else {
      deviceBrand = 'Apple';
    }

    let language: string | undefined;
    let timezone: string | undefined;

    // 1) Try Intl API (works on Hermes 0.70+)
    try {
      if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
        const opts = Intl.DateTimeFormat().resolvedOptions();
        timezone = opts.timeZone;
        language = opts.locale;
      }
    } catch {}

    // 2) Fallback to RN native modules when Intl is unavailable (JSC, older Hermes)
    if (!language || !timezone) {
      try {
        const { NativeModules } = require('react-native');
        if (!language) {
          if (Platform.OS === 'ios') {
            // iOS: SettingsManager provides locale info
            const settings = NativeModules.SettingsManager?.settings;
            language = settings?.AppleLocale || settings?.AppleLanguages?.[0];
          } else {
            // Android: I18nManager provides locale
            language = NativeModules.I18nManager?.localeIdentifier;
          }
        }
        if (!timezone) {
          // RN exposes default timezone in SettingsManager (iOS) or via platform default
          if (Platform.OS === 'ios') {
            timezone = NativeModules.SettingsManager?.settings?.AppleTimezone;
          }
          // Android: no direct native module for timezone without Intl,
          // leave undefined — server can infer from IP if needed
        }
      } catch {}
    }

    return {
      screen: { width: Math.round(screen.width), height: Math.round(screen.height) },
      language,
      timezone,
      mobile: {
        platform,
        osVersion,
        deviceModel,
        deviceBrand,
        appVersion: config.appVersion,
        appBuild: config.appBuild,
        sdkName: SDK_NAME,
        sdkVersion: SDK_VERSION,
      },
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
      queue.unshift(...events);
    });
  }

  async function send(event: ClientEvent) {
    await readyPromise;
    // Patch visitorId at send-time so it uses the persisted value
    (event as any).visitorId = visitorId!;
    queue.push(event);
    if (queue.length >= (config.batchSize ?? 10)) {
      flush();
    }
  }

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
      visitorIdLoaded = false;
      userId = null;
      // Persist the new visitorId
      AsyncStorage.setItem(VISITOR_KEY, visitorId).catch(() => {});
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
