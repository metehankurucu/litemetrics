/**
 * Integer environment variables, read the way the server needs them.
 *
 * Lives outside `index.ts` because that module boots a listening server the moment it
 * is imported, so nothing in it can be exercised from a test.
 */
export interface IntEnvOptions {
  /**
   * Smallest accepted value. Defaults to 1: for a port, a window size or a cap, zero is
   * a misconfiguration and falling back is kinder than booting something unusable.
   *
   * `min: 0` is for the settings where zero is a real choice rather than a mistake -
   * `BOT_VELOCITY_MAX_PAGEVIEWS=0` switches one bot-filter layer off without switching
   * the whole filter off, and a silent fallback to the default would leave the operator
   * who set it looking at a layer they believe they disabled.
   */
  min?: number;
}

export function intEnv(name: string, fallback: number, options: IntEnvOptions = {}): number {
  const min = options.min ?? 1;
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    console.warn(
      `Warning: ${name}="${raw}" is not an integer >= ${min}; falling back to ${fallback}`,
    );
    return fallback;
  }
  return parsed;
}
