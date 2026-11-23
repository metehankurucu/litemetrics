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

const MIN_EVENT_RETENTION_DAYS = 30;
const MAX_EVENT_RETENTION_DAYS = 36_500;

/**
 * Strict reader for EVENT_RETENTION_DAYS, the opt-in period after which raw events are
 * deleted. Returns 0 (disabled) or an integer from 30 to 36500, and never throws.
 *
 * Deliberately not `intEnv`: that parser accepts "120d" as 120 and falls back to a default
 * on a bad value, and for a setting that deletes data a typo must never turn into a
 * different, valid period. Anything that is not plain ASCII digits within the accepted
 * range disables retention and warns once; the server keeps booting.
 */
export function eventRetentionDaysEnv(name: string): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return 0;
  const reject = (): number => {
    console.warn(
      `Warning: ${name}="${raw}" is not an integer from ${MIN_EVENT_RETENTION_DAYS} to ${MAX_EVENT_RETENTION_DAYS}; ` +
      'event retention stays off and nothing will be deleted',
    );
    return 0;
  };
  if (!/^[0-9]+$/.test(raw)) return reject();
  const digits = raw.replace(/^0+/, '');
  if (digits === '') return 0;
  // More than five significant digits is beyond the maximum, and beyond safe-integer range too.
  if (digits.length > 5) return reject();
  const days = Number(digits);
  if (days < MIN_EVENT_RETENTION_DAYS || days > MAX_EVENT_RETENTION_DAYS) return reject();
  return days;
}
