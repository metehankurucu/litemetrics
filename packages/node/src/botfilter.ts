import { isbot } from 'isbot';

/** Sub-causes the signature layer can report. */
export type SignatureBotReason = 'empty-ua' | 'ua-signature';

/**
 * Layer 1 bot filter - signature match against the maintained `isbot` list.
 *
 * Returns why the UA looks like a bot, or null when it does not. A missing UA and an
 * isbot list match are both bot-shaped but need different responses from an operator,
 * so they are reported separately: a missing UA usually means a misconfigured SDK,
 * an isbot match usually means a real crawler.
 */
export function classifyUserAgent(ua: string): SignatureBotReason | null {
  if (!ua || ua.length === 0) return 'empty-ua';
  return isbot(ua) ? 'ua-signature' : null;
}

/**
 * Layer 1 bot filter - signature match against the maintained `isbot` list.
 * Returns true for known bots and for empty UA strings.
 */
export function isBot(ua: string): boolean {
  return classifyUserAgent(ua) !== null;
}

/** Alias for isBot - clarifies layer when composed with heuristic / rate-limit checks. */
export const isSignatureBot = isBot;
