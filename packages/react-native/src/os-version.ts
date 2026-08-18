export interface OsVersionInput {
  /** Platform.OS */
  platform: string;
  /** Platform.Version - a marketing string on iOS, the API level number on Android. */
  version: string | number | undefined;
  /** Platform.constants.Release on Android - the marketing release, e.g. "14". */
  release: unknown;
}

function text(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * Normalise the OS version so it means the same thing on both platforms.
 *
 * `Platform.Version` does not: on iOS it is the marketing version ("17.4"), on
 * Android it is the API level (37). Sending both through one field put "Android 37"
 * next to "iOS 17.4" in the dashboard - two scales that cannot be compared, and a
 * number that reads as an Android release nobody has ever shipped.
 *
 * Android carries the marketing release separately, as `Platform.constants.Release`,
 * so no API-level-to-version table is needed. When that is somehow missing, the API
 * level is labelled rather than emitted bare, so it can never be misread as a
 * release version.
 */
export function resolveOsVersion(input: OsVersionInput): string | undefined {
  const version = text(input.version);

  if (input.platform === 'android') {
    const release = text(input.release);
    if (release) return release;
    return version ? `API ${version}` : undefined;
  }

  return version;
}
