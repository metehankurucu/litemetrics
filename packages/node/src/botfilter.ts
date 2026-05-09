import { isbot } from 'isbot';

/**
 * Layer 1 bot filter - signature match against the maintained `isbot` list.
 * Returns true for known bots and for empty UA strings.
 */
export function isBot(ua: string): boolean {
  if (!ua || ua.length === 0) return true;
  return isbot(ua);
}

/** Alias for isBot - clarifies layer when composed with heuristic / rate-limit checks. */
export const isSignatureBot = isBot;
