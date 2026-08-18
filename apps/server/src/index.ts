import express from 'express';
import cors from 'cors';
import { createCollector } from '@litemetrics/node';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { createCollectSummary } from './collect-summary';
import { formatAccessLine, formatBotFilterLine } from './log-format';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// ─── Config from env ─────────────────────────────────────
type DbAdapter = 'clickhouse' | 'mongodb' | 'postgres';

const ADAPTER_CONFIG: Record<DbAdapter, { envVar: string; defaultUrl: string }> = {
  clickhouse: { envVar: 'CLICKHOUSE_URL', defaultUrl: 'http://localhost:8123' },
  mongodb:    { envVar: 'MONGODB_URL',    defaultUrl: 'mongodb://localhost:27017/litemetrics' },
  postgres:   { envVar: 'POSTGRES_URL',   defaultUrl: 'postgres://postgres:postgres@localhost:5432/litemetrics' },
};

function resolveDbConfig(): { adapter: DbAdapter; url: string } {
  const adapter = (process.env.DB_ADAPTER || 'clickhouse') as DbAdapter;
  const { envVar, defaultUrl } = ADAPTER_CONFIG[adapter];
  const url = process.env.DATABASE_URL || process.env[envVar] || defaultUrl;
  return { adapter, url };
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`Warning: ${name}="${raw}" is not a positive integer; falling back to ${fallback}`);
    return fallback;
  }
  return parsed;
}

const PORT = intEnv('PORT', 3002);
const { adapter: DB_ADAPTER, url: DATABASE_URL } = resolveDbConfig();
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.LITEMETRICS_ADMIN_SECRET;
const GEOIP = process.env.GEOIP !== 'false';
const TRUST_PROXY = process.env.TRUST_PROXY !== 'false';
const BOT_FILTER_MODE = (process.env.BOT_FILTER_MODE || 'standard') as 'off' | 'standard' | 'strict' | 'shadow';
const BOT_RATE_WINDOW_MS = intEnv('BOT_RATE_WINDOW_MS', 60_000);
const BOT_RATE_MAX = intEnv('BOT_RATE_MAX', 60);
const BOT_LOG_MAX_PER_MIN = intEnv('BOT_LOG_MAX_PER_MIN', 20);

const COLLECT_PATH = '/api/collect';

// ─── Request logger ──────────────────────────────────────
// /api/collect is aggregated into one line per minute; everything else keeps a
// per-request line, now with the response status and how long it took.
//
// Registered before CORS and the body parser on purpose. Behind those, a request
// whose body never finishes arriving is rejected by express.json() before this
// middleware ever runs, so the aborted collect batch is invisible - and a lost batch
// is lost data, the one thing this summary exists to make countable.
const collectSummary = createCollectSummary({ maxBotLinesPerMinute: BOT_LOG_MAX_PER_MIN });

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  // POST only: a CORS preflight OPTIONS or a scanner's GET is not a batch, and folding
  // them into reqs= would make the summary read as more batches than arrived. They
  // keep their per-request line below instead.
  const isCollect = req.method === 'POST' && req.path === COLLECT_PATH;
  // Captured up front: a router can rewrite req.url before the response completes.
  const url = req.originalUrl || req.url;
  const method = req.method;

  // Three hooks, one record. The runtime image runs Bun (`node` there is a symlink to
  // bun), and Bun's http shim signals less than Node's does, so each hook covers a case
  // the others miss - measured against the built artifact under both runtimes:
  //   res.end      - the handler answering; first to fire for every served request on
  //                  both runtimes. Under Bun it is also the *only* signal for a client
  //                  that left after its body arrived but before the answer: no event
  //                  fires at all, and headersSent stays false through end().
  //   res 'close'  - every completed response on both runtimes; under Node also every
  //                  abort, including one the handler never answered.
  //   req 'close'  - fires at body end, so it says nothing about the response; only
  //                  consulted when the body itself was cut off.
  let recorded = false;
  const record = (aborted: boolean) => {
    if (recorded) return;
    recorded = true;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    if (isCollect) {
      collectSummary.recordRequest(res.statusCode, durationMs, aborted);
      return;
    }

    const auth = req.headers['x-litemetrics-admin-secret']
      ? '[admin]'
      : req.headers['x-litemetrics-secret']
      ? '[secret]'
      : '';
    console.log(
      formatAccessLine({
        timestamp: Date.now(),
        method,
        url,
        statusCode: res.statusCode,
        durationMs,
        auth,
        aborted,
      }),
    );
  };
  // Aborted = the client gave up: its body never finished arriving (readableAborted,
  // which stays true even after express has answered the abort with its own 400) or it
  // hung up before an answer went out (headersSent stays false). Not req.complete: that
  // is still false inside a synchronous handler's end(), and stays false on Node for a
  // body nobody read, so it would mark served requests as aborted.
  const wasAborted = () => req.readableAborted || !res.headersSent;
  res.on('close', () => record(wasAborted()));
  req.on('close', () => {
    if (req.readableAborted) record(true);
  });
  const originalEnd = res.end;
  res.end = ((...args: unknown[]) => {
    const ret = (originalEnd as (...a: unknown[]) => typeof res).apply(res, args);
    record(wasAborted());
    return ret;
  }) as typeof res.end;

  next();
});

// ─── CORS ────────────────────────────────────────────────
const corsOptions = cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Litemetrics-Secret', 'X-Litemetrics-Admin-Secret'],
});

app.options('/{*path}', corsOptions);
app.use(corsOptions);
app.use(express.json());

// ─── Initialize collector ────────────────────────────────
const collector = await createCollector({
  db: { adapter: DB_ADAPTER, url: DATABASE_URL },
  adminSecret: ADMIN_SECRET,
  geoip: GEOIP,
  trustProxy: TRUST_PROXY,
  botFilter: {
    defaultMode: BOT_FILTER_MODE,
    rateLimitWindowMs: BOT_RATE_WINDOW_MS,
    rateLimitMaxEvents: BOT_RATE_MAX,
    onBotDetected: (info) => {
      // Lightweight audit log - kept structured so it's grep-friendly in Railway logs.
      // The counters always land in the minute summary; the detail line is capped so a
      // bot storm cannot push everything else out of the retained log window.
      const shouldLogDetail = collectSummary.recordBot({
        siteId: info.siteId,
        reason: info.reason,
        action: info.action,
      });
      if (shouldLogDetail) console.log(formatBotFilterLine(info));
    },
    onSiteTypeMismatch: (info) => {
      // This site sends app SDK events but is not typed as an app. Unless its mode is
      // `off` it is still filtered as browser traffic and keeps losing its Android
      // events; either way the dashboard shows it as a web site. Fix is one call:
      // PUT /api/sites/<id> {"type":"app"}.
      const consequence = info.mode === 'off'
        ? 'not filtered (mode=off) but shown as a web site'
        : 'app SDK events on a non-app site are still filtered as browser traffic';
      console.warn(
        `[site-type-mismatch] site=${info.siteId} type=${info.siteType ?? 'unset'} platform=${info.platform} mode=${info.mode} - ${consequence}`,
      );
    },
  },
});

// ─── API Routes ──────────────────────────────────────────
const collectHandler = collector.handler();
const queryHandler = collector.queryHandler();
const eventsHandler = collector.eventsHandler();
const usersHandler = collector.usersHandler();
const sitesHandler = collector.sitesHandler();

app.get('/health', (_req, res) => { res.json({ ok: true, adapter: DB_ADAPTER }); });

app.all('/api/collect', async (req, res) => { await collectHandler(req, res); });
app.all('/api/stats', async (req, res) => { await queryHandler(req, res); });
app.all('/api/events', async (req, res) => { await eventsHandler(req, res); });
app.all('/api/users', async (req, res) => { await usersHandler(req, res); });
app.all('/api/users/{*path}', async (req, res) => { await usersHandler(req, res); });
app.all('/api/sites', async (req, res) => { await sitesHandler(req, res); });
app.all('/api/sites/{*path}', async (req, res) => { await sitesHandler(req, res); });

// ─── Serve tracker script ────────────────────────────────
// Try multiple paths for tracker script
const trackerPaths = [
  join(__dirname, '../../packages/tracker/dist/litemetrics.global.js'),
  join(__dirname, '../../../packages/tracker/dist/litemetrics.global.js'),
];

app.get('/tracker.js', (_req, res) => {
  for (const p of trackerPaths) {
    if (existsSync(p)) {
      res.sendFile(p);
      return;
    }
  }
  res.status(404).send('Tracker script not found. Run: turbo build --filter=@litemetrics/tracker');
});

// Also serve as /litemetrics.js for compatibility
app.get('/litemetrics.js', (_req, res) => {
  for (const p of trackerPaths) {
    if (existsSync(p)) {
      res.sendFile(p);
      return;
    }
  }
  res.status(404).send('Tracker script not found');
});

// ─── Serve dashboard static files ────────────────────────
const dashboardPaths = [
  join(__dirname, '../../dashboard/dist'),
  join(__dirname, '../../../apps/dashboard/dist'),
];

let dashboardDir: string | null = null;
for (const p of dashboardPaths) {
  if (existsSync(p)) {
    dashboardDir = p;
    break;
  }
}

if (dashboardDir) {
  app.use(express.static(dashboardDir));

  // SPA fallback - serve index.html for all non-API, non-asset routes
  app.get('/{*path}', (req, res) => {
    // Don't catch API routes or file extensions (assets)
    if (req.path.startsWith('/api/') || req.path.match(/\.\w+$/)) {
      res.status(404).send('Not found');
      return;
    }
    res.sendFile(join(dashboardDir!, 'index.html'));
  });
}

// ─── Shutdown ────────────────────────────────────────────
// Railway sends SIGTERM on every redeploy. Without this the open minute is lost, and
// that is exactly the window a deploy-triggered problem would show up in.
process.on('beforeExit', () => { collectSummary.flush(); });
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    collectSummary.flush();
    process.exit(0);
  });
}

// ─── Start server ────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  Litemetrics Server running at http://localhost:${PORT}`);
  console.log(`  Database: ${DB_ADAPTER} @ ${DATABASE_URL}\n`);
  console.log(`  API Endpoints:`);
  console.log(`    POST /api/collect     - Event collection`);
  console.log(`    GET  /api/stats       - Query analytics`);
  console.log(`    GET  /api/events      - List events`);
  console.log(`    GET  /api/users       - List users`);
  console.log(`    ALL  /api/sites       - Site management`);
  console.log(`    GET  /tracker.js      - Browser tracker script`);
  if (dashboardDir) {
    console.log(`    GET  /               - Dashboard UI`);
  } else {
    console.log(`    Dashboard not built - run: turbo build --filter=@litemetrics/dashboard`);
  }
  console.log();
  if (!ADMIN_SECRET) {
    console.log(`  Warning: ADMIN_SECRET not set - site management disabled`);
    console.log(`  Set it: ADMIN_SECRET=my-secret bun run dev\n`);
  }
});
