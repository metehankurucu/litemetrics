import express from 'express';
import cors from 'cors';
import { createCollector } from '@litemetrics/node';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// ─── Config from env ─────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3002', 10);
const DB_ADAPTER = (process.env.DB_ADAPTER || 'clickhouse') as 'clickhouse' | 'mongodb';
const DATABASE_URL = process.env.DATABASE_URL
  || process.env.CLICKHOUSE_URL
  || process.env.MONGODB_URL
  || (DB_ADAPTER === 'clickhouse' ? 'http://localhost:8123' : 'mongodb://localhost:27017/litemetrics');
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.LITEMETRICS_ADMIN_SECRET;
const GEOIP = process.env.GEOIP !== 'false';
const TRUST_PROXY = process.env.TRUST_PROXY !== 'false';

// ─── CORS ────────────────────────────────────────────────
const corsOptions = cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Litemetrics-Secret', 'X-Litemetrics-Admin-Secret'],
});

app.options('/{*path}', corsOptions);
app.use(corsOptions);
app.use(express.json());

// ─── Request logger ──────────────────────────────────────
app.use((req, _res, next) => {
  const ts = new Date().toISOString().slice(11, 19);
  const auth = req.headers['x-litemetrics-admin-secret']
    ? '[admin]'
    : req.headers['x-litemetrics-secret']
    ? '[secret]'
    : '';
  console.log(`${ts} ${req.method} ${req.url} ${auth}`);
  next();
});

// ─── Initialize collector ────────────────────────────────
const collector = await createCollector({
  db: { adapter: DB_ADAPTER, url: DATABASE_URL },
  adminSecret: ADMIN_SECRET,
  geoip: GEOIP,
  trustProxy: TRUST_PROXY,
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
