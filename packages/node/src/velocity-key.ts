import { createHash } from 'node:crypto';

/**
 * Longest `visitorId` layer 4 will key a window on. Anything longer is skipped, not
 * truncated.
 *
 * The hash below already bounds what is STORED, so this bounds the work done before it:
 * `visitorId` arrives in the request body and is never validated, and `parseBody` reads a
 * non-JSON body with no size cap, so `express.json()`'s 100 KB limit is cleared by a
 * single `Content-Type: text/plain` header. Trimming and hashing a multi-megabyte string,
 * once per pageview in a 100-event batch, is CPU an unauthenticated caller should not be
 * able to buy that cheaply.
 *
 * Skipping rather than truncating, because truncation would collapse distinct ids onto one
 * key and let a flood ride in on a real visitor's window. 128 is generous: both shipped
 * SDKs emit 16 characters (`packages/tracker/src/session.ts` `hash.slice(0, 16)`,
 * `packages/react-native/src/tracker.ts` `generateId().slice(0, 16)`).
 */
export const MAX_VISITOR_KEY_LEN = 128;

/**
 * The key of one layer-4 sliding window: a SHA-256 of the `siteId` / `visitorId` pair.
 *
 * A Map key is retained for the life of its entry, so the key's LENGTH is what bounds this
 * layer's memory, and both halves of the pair reach the collector as unvalidated request
 * body text. Bounding one half and not the other bounds nothing: `visitorVelocityMaxKeys`
 * caps how MANY windows exist, never how big each one's key is. Hashing fixes every key at
 * 64 characters whatever arrives, so the ceiling is the key count times a constant instead
 * of container memory.
 *
 * Hashing rather than truncating for the same reason the length guard skips rather than
 * truncates: two different pairs must never collapse onto one window.
 *
 * The caller also resolves the site first, so in practice `siteId` is a stored site id
 * (`generateSiteId()` emits 17 characters). This function is what makes the bound hold
 * without depending on that: an adapter that one day returns something else, or a caller
 * that forgets the gate, still costs 64 characters.
 *
 * The site half is length-prefixed so the two cannot be shifted across the separator:
 * without it, site `a:b` visitor `c` and site `a` visitor `b:c` would share a window.
 */
export function velocityKey(siteId: string, visitorId: string): string {
  return createHash('sha256').update(`${siteId.length}:${siteId}:${visitorId}`).digest('hex');
}
