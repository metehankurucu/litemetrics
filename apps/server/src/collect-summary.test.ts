import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCollectSummary, type BotHit, type CollectSummary } from './collect-summary';

const MINUTE = 60_000;
const T0 = Date.parse('2026-08-16T14:59:00.000Z');

function harness(overrides: Parameters<typeof createCollectSummary>[0] = {}) {
  const lines: string[] = [];
  let clock = T0;
  const summary = createCollectSummary({
    now: () => clock,
    emit: (line) => lines.push(line),
    ...overrides,
  });
  return {
    summary,
    lines,
    advance: (ms: number) => {
      clock += ms;
    },
    at: (ms: number) => {
      clock = T0 + ms;
    },
  };
}

function field(line: string, key: string): string {
  const match = line.match(new RegExp(`(?:^|\\s)${key}=(\\S+)`));
  if (!match) throw new Error(`no ${key}= in ${line}`);
  return match[1];
}

let open: CollectSummary | null = null;
afterEach(() => {
  open?.stop();
  open = null;
});

describe('createCollectSummary', () => {
  it('replaces per-request lines with one summary line for the minute', () => {
    const h = harness();
    open = h.summary;

    for (let i = 0; i < 5; i++) h.summary.recordRequest(200, 3);
    expect(h.lines).toHaveLength(0); // nothing emitted while the minute is open

    h.at(MINUTE);
    h.summary.recordRequest(200, 3);

    expect(h.lines).toHaveLength(1);
    expect(h.lines[0]).toContain('[collect] minute=2026-08-16T14:59');
    expect(field(h.lines[0], 'reqs')).toBe('5');
  });

  // R7: a quiet minute must not cost a log line - the whole point is the 5000-line cap.
  it('writes nothing for a minute with no traffic', () => {
    const h = harness();
    open = h.summary;

    h.summary.recordRequest(200, 3);
    h.at(MINUTE * 5); // four silent minutes in between
    h.summary.recordRequest(200, 3);

    expect(h.lines).toHaveLength(1);
    expect(field(h.lines[0], 'minute')).toBe('2026-08-16T14:59');
  });

  it('counts status classes separately', () => {
    const h = harness();
    open = h.summary;

    h.summary.recordRequest(200, 1);
    h.summary.recordRequest(204, 1);
    h.summary.recordRequest(304, 1);
    h.summary.recordRequest(400, 1);
    h.summary.recordRequest(405, 1);
    h.summary.recordRequest(500, 1);
    h.summary.flush();

    const line = h.lines[0];
    expect(field(line, 'reqs')).toBe('6');
    expect(field(line, 'ok')).toBe('2');
    expect(field(line, '3xx')).toBe('1');
    expect(field(line, '4xx')).toBe('2');
    expect(field(line, '5xx')).toBe('1');
  });

  it('reports p50, p95 and max duration', () => {
    const h = harness();
    open = h.summary;

    for (let i = 1; i <= 100; i++) h.summary.recordRequest(200, i);
    h.summary.flush();

    const line = h.lines[0];
    expect(field(line, 'dur_p50')).toBe('50');
    expect(field(line, 'dur_p95')).toBe('95');
    expect(field(line, 'dur_max')).toBe('100');
  });

  it('renders dashes rather than zeros when no durations were seen', () => {
    const h = harness();
    open = h.summary;

    h.summary.recordBot({ siteId: 'site_a', reason: 'ua-signature', action: 'dropped' });
    h.summary.flush();

    const line = h.lines[0];
    expect(field(line, 'dur_p50')).toBe('-');
    expect(field(line, 'dur_max')).toBe('-');
  });

  it('breaks bot hits down by reason and by site', () => {
    const h = harness();
    open = h.summary;

    for (let i = 0; i < 3; i++)
      h.summary.recordBot({ siteId: 'site_a', reason: 'ua-signature', action: 'dropped' });
    h.summary.recordBot({ siteId: 'site_b', reason: 'empty-ua', action: 'dropped' });
    h.summary.recordBot({ siteId: 'site_a', reason: 'ua-signature', action: 'flagged' });
    h.summary.recordRequest(200, 2);
    h.summary.flush();

    const line = h.lines[0];
    expect(field(line, 'bot_dropped')).toBe('4');
    expect(field(line, 'bot_flagged')).toBe('1');
    expect(field(line, 'reasons')).toBe('ua-signature:4,empty-ua:1');
    expect(field(line, 'sites')).toBe('site_a:4,site_b:1');
  });

  it('collapses the tail of a long site list', () => {
    const h = harness({ topSites: 2 });
    open = h.summary;

    for (const site of ['site_a', 'site_a', 'site_b', 'site_c', 'site_d'])
      h.summary.recordBot({ siteId: site, reason: 'ua-signature', action: 'dropped' });
    h.summary.flush();

    expect(field(h.lines[0], 'sites')).toBe('site_a:2,site_b:1,+2');
  });

  // siteId comes from the request body, so a caller rotating it could otherwise mint
  // unbounded map keys inside a single minute.
  it('stops growing the site map past the cap without losing the totals', () => {
    const h = harness({ maxTrackedSites: 3, topSites: 10 });
    open = h.summary;

    for (let i = 0; i < 500; i++)
      h.summary.recordBot({ siteId: `site_${i}`, reason: 'ua-signature', action: 'dropped' });
    h.summary.flush();

    const line = h.lines[0];
    expect(field(line, 'bot_dropped')).toBe('500');
    // The cap must not make the line read as "only 3 sites were hit".
    expect(field(line, 'sites')).toBe('site_0:1,site_1:1,site_2:1,untracked:497');
  });

  it('caps detail lines per minute and reports the suppressed count', () => {
    const h = harness({ maxBotLinesPerMinute: 2 });
    open = h.summary;

    const hit: BotHit = { siteId: 'site_a', reason: 'ua-signature', action: 'dropped' };
    expect(h.summary.recordBot(hit)).toBe(true);
    expect(h.summary.recordBot(hit)).toBe(true);
    expect(h.summary.recordBot(hit)).toBe(false);
    expect(h.summary.recordBot(hit)).toBe(false);
    h.summary.flush();

    expect(field(h.lines[0], 'suppressed')).toBe('2');
  });

  it('lets detail lines through again once the minute rolls over', () => {
    const h = harness({ maxBotLinesPerMinute: 1 });
    open = h.summary;

    const hit: BotHit = { siteId: 'site_a', reason: 'ua-signature', action: 'dropped' };
    expect(h.summary.recordBot(hit)).toBe(true);
    expect(h.summary.recordBot(hit)).toBe(false);
    h.at(MINUTE);
    expect(h.summary.recordBot(hit)).toBe(true);
  });

  // Railway sends SIGTERM on redeploy; without this the last minute is lost, which
  // is exactly the window a deploy-triggered problem would show up in.
  it('flush() emits the open minute so shutdown does not lose it', () => {
    const h = harness();
    open = h.summary;

    h.summary.recordRequest(200, 7);
    h.summary.flush();

    expect(h.lines).toHaveLength(1);
    expect(field(h.lines[0], 'reqs')).toBe('1');
  });

  it('flush() on an empty bucket stays silent and is safe to call twice', () => {
    const h = harness();
    open = h.summary;

    h.summary.flush();
    h.summary.flush();
    expect(h.lines).toHaveLength(0);
  });

  it('unrefs its timer so it never keeps the process alive', () => {
    const unref = vi.fn();
    const spy = vi
      .spyOn(globalThis, 'setInterval')
      .mockReturnValue({ unref } as unknown as ReturnType<typeof setInterval>);
    try {
      const summary = createCollectSummary({ emit: () => {} });
      expect(unref).toHaveBeenCalledOnce();
      summary.stop();
    } finally {
      spy.mockRestore();
    }
  });

  it('closes a finished minute from the timer even when no new request arrives', () => {
    const h = harness({ checkIntervalMs: 1000 });
    open = h.summary;

    h.summary.recordRequest(200, 3);
    h.at(MINUTE + 1000);
    h.summary.tick();

    expect(h.lines).toHaveLength(1);
    expect(field(h.lines[0], 'minute')).toBe('2026-08-16T14:59');
  });

  it('keeps an exact max while sampling durations under a cap', () => {
    const h = harness({ maxDurationSamples: 10 });
    open = h.summary;

    for (let i = 0; i < 1000; i++) h.summary.recordRequest(200, i);
    h.summary.recordRequest(200, 9999);
    h.summary.flush();

    expect(field(h.lines[0], 'reqs')).toBe('1001');
    expect(field(h.lines[0], 'dur_max')).toBe('9999');
  });
});
