import { format } from 'node:util';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { eventRetentionDaysEnv, intEnv } from './env';

/**
 * Contract R4 (a), R4 (c) and R5 (a): the strict EVENT_RETENTION_DAYS reader and the
 * boot status line formatter.
 *
 * `env.ts` imports nothing from `@litemetrics/node` (contract decision 17), so its
 * tests must not need a built node package. `log-format.ts` does import it, so the
 * formatter is loaded on its own, inside its describe block.
 */

const NAME = 'LM_TEST_EVENT_RETENTION_DAYS';

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  delete process.env[NAME];
  delete process.env.LM_TEST_EVENT_RETENTION_OTHER;
});

afterEach(() => {
  warn.mockRestore();
  delete process.env[NAME];
  delete process.env.LM_TEST_EVENT_RETENTION_OTHER;
});

function read(raw: string | undefined, name = NAME): number {
  if (raw === undefined) delete process.env[name];
  else process.env[name] = raw;
  return eventRetentionDaysEnv(name);
}

/** The single warning of this call, as console.warn would print it. */
function onlyWarning(): string {
  expect(warn).toHaveBeenCalledTimes(1);
  return format(...(warn.mock.calls[0] as unknown[]));
}

function expectWarnedAbout(raw: string, name = NAME): void {
  const message = onlyWarning();
  expect(message).toContain(`${name}="${raw}"`);
  expect(message).toContain('nothing will be deleted');
}

describe('R4 (a) eventRetentionDaysEnv', () => {
  it('R4 (a) step 1: an unset variable returns 0 without a warning', () => {
    expect(read(undefined)).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('R4 (a) step 1: an empty variable returns 0 without a warning', () => {
    expect(read('')).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ' 30', '30 ', ' ', '\t30', '30\n', ' 30',
    '+30', '-30', '-0',
    '30.0', '30.5', '3e1', '1e2', '0x1e', '0b11110',
    '120d', '30d', '30 days', '30_000', '3,000',
    '٣٠', '３０',
    'abc', 'NaN', 'Infinity', 'true',
  ])('R4 (a) step 2: %j is not all ASCII digits, so it returns 0 and warns once, quoting it verbatim', (raw) => {
    expect(read(raw)).toBe(0);
    expectWarnedAbout(raw);
  });

  it.each(['0', '00', '000'])('R4 (a) step 3: %j is a decimal zero, so it returns 0 without a warning', (raw) => {
    expect(read(raw)).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['1', '7', '29', '029', '0029'])('R4 (a) step 4: %j is below the 30-day floor, so it returns 0 and warns once', (raw) => {
    expect(read(raw)).toBe(0);
    expectWarnedAbout(raw);
  });

  it.each([
    { label: '36501', raw: '36501' },
    { label: '99999', raw: '99999' },
    { label: '36501 with leading zeros', raw: '000036501' },
    { label: 'a digit string beyond the safe-integer range', raw: '9007199254740993' },
    { label: 'a 401-digit string', raw: `1${'0'.repeat(400)}` },
  ])('R4 (a) step 5: $label is above 36500, so it returns 0 and warns once', ({ raw }) => {
    expect(read(raw)).toBe(0);
    expectWarnedAbout(raw);
  });

  it.each([
    { raw: '30', days: 30 },
    { raw: '030', days: 30 },
    { raw: '0030', days: 30 },
    { raw: '31', days: 31 },
    { raw: '365', days: 365 },
    { raw: '36500', days: 36_500 },
    { raw: '0036500', days: 36_500 },
  ])('R4 (a) step 6: $raw returns $days without a warning', ({ raw, days }) => {
    expect(read(raw)).toBe(days);
    expect(warn).not.toHaveBeenCalled();
  });

  it('R4 (a) reads process.env at call time, not once', () => {
    expect(read('45')).toBe(45);
    expect(read('90')).toBe(90);
    expect(read(undefined)).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('R4 (a) the warning names the variable it was asked to read', () => {
    expect(read('120d', 'LM_TEST_EVENT_RETENTION_OTHER')).toBe(0);
    expectWarnedAbout('120d', 'LM_TEST_EVENT_RETENTION_OTHER');
    expect(onlyWarning()).not.toContain(NAME);
  });

  it('R4 (a) each invalid call warns exactly once, and a valid call after it adds none', () => {
    read('7');
    expect(warn).toHaveBeenCalledTimes(1);
    read('7');
    expect(warn).toHaveBeenCalledTimes(2);
    read('30');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('R4 (c) intEnv keeps its lenient parse and its own fallback for the same raw value', () => {
    process.env[NAME] = '120d';
    expect(intEnv(NAME, 60)).toBe(120);
    expect(warn).not.toHaveBeenCalled();
    expect(eventRetentionDaysEnv(NAME)).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('R5 (a) formatEventRetentionStatusLine', () => {
  let statusLine: typeof import('./log-format').formatEventRetentionStatusLine;

  beforeAll(async () => {
    ({ formatEventRetentionStatusLine: statusLine } = await import('./log-format'));
  });

  it.each(['postgres', 'clickhouse', 'mongodb'])('R5 (a) days 0 on %s reads off', (adapter) => {
    const line = statusLine(0, adapter);
    expect(line.trim().startsWith('Event retention:')).toBe(true);
    expect(line).toContain('off');
    expect(line).not.toMatch(/[\r\n]/);
  });

  it.each([30, 90, 36_500])('R5 (a) %s days on postgres shows the period and does not read off', (days) => {
    const line = statusLine(days, 'postgres');
    expect(line.trim().startsWith('Event retention:')).toBe(true);
    expect(line).toContain(`${days} days`);
    expect(line).not.toContain('off');
    expect(line).not.toMatch(/[\r\n]/);
  });

  it.each(['clickhouse', 'mongodb', 'Postgres', ''])(
    'R5 (a) days > 0 on adapter %j reads off and names postgres',
    (adapter) => {
      const line = statusLine(30, adapter);
      expect(line.trim().startsWith('Event retention:')).toBe(true);
      expect(line).toContain('off');
      expect(line).toContain('postgres');
    },
  );

  it('R5 (a) is pure: the same input gives the same line and nothing is printed', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(statusLine(30, 'postgres')).toBe(statusLine(30, 'postgres'));
      expect(statusLine(0, 'clickhouse')).toBe(statusLine(0, 'clickhouse'));
      expect(statusLine(30, 'postgres')).not.toBe(statusLine(31, 'postgres'));
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
