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

  // A client that gives up - body never completed, or hung up before the answer - is
  // the lost-batch case the summary exists for. It is its own outcome class: counted
  // in reqs= and aborted=, and kept out of the status classes, because the status code
  // at that point (express's own 400, or the default 200) was never delivered.
  it('counts an aborted request in reqs and aborted, not in a status class', () => {
    const h = harness();
    open = h.summary;

    h.summary.recordRequest(200, 3);
    h.summary.recordRequest(200, 190, true); // client left mid-handler, default 200
    h.summary.recordRequest(400, 300, true); // body never completed, express set 400
    h.summary.flush();

    const line = h.lines[0];
    expect(field(line, 'reqs')).toBe('3');
    expect(field(line, 'ok')).toBe('1');
    expect(field(line, '4xx')).toBe('0');
    expect(field(line, 'aborted')).toBe('2');
  });

  it('reports aborted=0 for a minute where every request was answered', () => {
    const h = harness();
    open = h.summary;

    h.summary.recordRequest(200, 3);
    h.summary.recordRequest(500, 3, false);
    h.summary.flush();

    const line = h.lines[0];
    expect(field(line, 'aborted')).toBe('0');
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
    expect(field(line, 'bot_sites')).toBe('site_a:4,site_b:1');
  });

  // The field counts bot hits, not requests - the name has to survive a reader who
  // sees it next to reqs= and assumes it is per-site traffic.
  it('leaves bot_sites empty for a busy minute with no bot hits', () => {
    const h = harness();
    open = h.summary;

    for (let i = 0; i < 12; i++) h.summary.recordRequest(200, 3);
    h.summary.flush();

    const line = h.lines[0];
    expect(field(line, 'reqs')).toBe('12');
    expect(field(line, 'bot_sites')).toBe('-');
    expect(line).not.toMatch(/(?:^|\s)sites=/);
  });

  it('collapses the tail of a long site list', () => {
    const h = harness({ topSites: 2 });
    open = h.summary;

    for (const site of ['site_a', 'site_a', 'site_b', 'site_c', 'site_d'])
      h.summary.recordBot({ siteId: site, reason: 'ua-signature', action: 'dropped' });
    h.summary.flush();

    expect(field(h.lines[0], 'bot_sites')).toBe('site_a:2,site_b:1,+2');
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
    expect(field(line, 'bot_sites')).toBe('site_0:1,site_1:1,site_2:1,untracked:497');
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

// ─── O1: error classes behind the 5xx counter ─────────
// 5xx=10 was countable but not diagnosable. err_codes= carries the stage:class of
// every collect failure in the minute, so a database outage and a malformed body
// stop looking identical.
describe('createCollectSummary error tracking', () => {
  it('counts repeats of the same stage:class into one err_codes entry', () => {
    const h = harness();
    open = h.summary;

    h.summary.recordRequest(500, 12);
    h.summary.recordError('insert:ECONNRESET');
    h.summary.recordError('insert:ECONNRESET');
    h.summary.flush();

    expect(field(h.lines[0], 'err_codes')).toBe('insert:ECONNRESET:2');
  });

  it('writes a dash when the minute had no errors', () => {
    const h = harness();
    open = h.summary;

    h.summary.recordRequest(200, 3);
    h.summary.flush();

    expect(field(h.lines[0], 'err_codes')).toBe('-');
  });

  // Monitoring parses this line by position for the fields that already existed, so
  // the new field goes on the end and nothing before it moves.
  it('appends err_codes at the end, after suppressed, leaving the existing order intact', () => {
    const h = harness();
    open = h.summary;

    h.summary.recordRequest(500, 5);
    h.summary.recordError('insert:ECONNRESET');
    h.summary.flush();

    const keys = h.lines[0].split(' ').slice(1).map((f) => f.split('=')[0]);
    expect(keys).toEqual([
      'minute', 'reqs', 'ok', '3xx', '4xx', '5xx', 'aborted',
      'dur_p50', 'dur_p95', 'dur_max',
      'bot_dropped', 'bot_flagged', 'reasons', 'bot_sites', 'suppressed', 'err_codes',
    ]);
  });

  it('allows five detail lines per minute by default, then suppresses', () => {
    const h = harness();
    open = h.summary;

    const allowed = [];
    for (let i = 0; i < 7; i++) allowed.push(h.summary.recordError('insert:ECONNRESET'));

    expect(allowed).toEqual([true, true, true, true, true, false, false]);
  });

  it('honours a custom per-minute detail cap', () => {
    const h = harness({ maxErrorLinesPerMinute: 1 });
    open = h.summary;

    expect(h.summary.recordError('insert:ECONNRESET')).toBe(true);
    expect(h.summary.recordError('site:ETIMEDOUT')).toBe(false);
  });

  it('gives the next minute a fresh detail budget', () => {
    const h = harness({ maxErrorLinesPerMinute: 1 });
    open = h.summary;

    expect(h.summary.recordError('insert:ECONNRESET')).toBe(true);
    expect(h.summary.recordError('insert:ECONNRESET')).toBe(false);
    h.at(MINUTE);
    expect(h.summary.recordError('insert:ECONNRESET')).toBe(true);
  });

  // The error class can come from a driver quoting the request back, so the key set
  // is not bounded by anything the server controls.
  it('caps the number of distinct keys and names the overflow', () => {
    const h = harness({ maxTrackedErrors: 2 });
    open = h.summary;

    h.summary.recordRequest(500, 5);
    h.summary.recordError('insert:A');
    h.summary.recordError('insert:B');
    h.summary.recordError('insert:C');
    h.summary.recordError('insert:D');
    h.summary.flush();

    const codes = field(h.lines[0], 'err_codes');
    expect(codes).toContain('insert:A:1');
    expect(codes).toContain('insert:B:1');
    expect(codes).toContain('untracked:2');
    expect(codes).not.toContain('insert:C');
  });

  it('lists the ten most common keys and counts the rest', () => {
    const h = harness();
    open = h.summary;

    h.summary.recordRequest(500, 5);
    for (let i = 0; i < 12; i++) {
      for (let n = 0; n <= i; n++) h.summary.recordError(`insert:E${i}`);
    }
    h.summary.flush();

    const codes = field(h.lines[0], 'err_codes').split(',');
    expect(codes).toHaveLength(11);
    expect(codes[0]).toBe('insert:E11:12');
    expect(codes[10]).toBe('+2');
  });

  it('sanitizes a key so a driver message cannot break the line', () => {
    const h = harness();
    open = h.summary;

    h.summary.recordRequest(500, 5);
    h.summary.recordError('insert:boom\nerr_codes=fake:1');
    h.summary.flush();

    expect(h.lines[0].split('\n')).toHaveLength(1);
    expect(field(h.lines[0], 'err_codes')).toBe('insert:boomerr_codes=fake:1:1');
  });

  // The error is reported before the response completes, so a failure at the very end
  // of a minute can land in a bucket whose request lands in the next one.
  it('still emits a minute that saw only an error', () => {
    const h = harness();
    open = h.summary;

    h.summary.recordError('insert:ECONNRESET');
    h.summary.flush();

    expect(h.lines).toHaveLength(1);
    expect(field(h.lines[0], 'err_codes')).toBe('insert:ECONNRESET:1');
  });
});
