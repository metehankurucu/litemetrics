import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { intEnv } from './env';

describe('intEnv', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.LM_TEST_INT;
  });

  afterEach(() => {
    warn.mockRestore();
    delete process.env.LM_TEST_INT;
  });

  it('returns the fallback when the variable is unset or empty', () => {
    expect(intEnv('LM_TEST_INT', 60)).toBe(60);
    process.env.LM_TEST_INT = '';
    expect(intEnv('LM_TEST_INT', 60)).toBe(60);
    expect(warn).not.toHaveBeenCalled();
  });

  it('parses a set value', () => {
    process.env.LM_TEST_INT = '120';
    expect(intEnv('LM_TEST_INT', 60)).toBe(120);
  });

  it.each(['abc', '-1', '0', ' '])(
    'warns and falls back on %s when the default minimum applies',
    (raw) => {
      process.env.LM_TEST_INT = raw;
      expect(intEnv('LM_TEST_INT', 60)).toBe(60);
      expect(warn).toHaveBeenCalledOnce();
    },
  );

  // The bot-filter escape valve. An operator hitting a velocity false positive sets
  // BOT_VELOCITY_MAX_PAGEVIEWS=0 to switch that one layer off; a silent fallback to the
  // default would leave the layer running and the operator sure it was not.
  it('accepts 0 when min is 0, without warning', () => {
    process.env.LM_TEST_INT = '0';
    expect(intEnv('LM_TEST_INT', 30, { min: 0 })).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('still rejects a negative value when min is 0', () => {
    process.env.LM_TEST_INT = '-5';
    expect(intEnv('LM_TEST_INT', 30, { min: 0 })).toBe(30);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('takes the leading integer of a value like "60s", the way parseInt does', () => {
    process.env.LM_TEST_INT = '60s';
    expect(intEnv('LM_TEST_INT', 10)).toBe(60);
  });
});
