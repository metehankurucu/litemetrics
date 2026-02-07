import express from "express";
import cors from "cors";
import { createCollector } from "@litemetrics/node";
import { join } from "path";

const app = express();

const corsOptions = cors({
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Litemetrics-Secret", "X-Litemetrics-Admin-Secret"],
});

// Preflight - must be before other routes
app.options("/{*path}", corsOptions);
app.use(corsOptions);
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  const ts = new Date().toISOString().slice(11, 19);
  const auth = req.headers["x-litemetrics-admin-secret"]
    ? "[admin]"
    : req.headers["x-litemetrics-secret"]
    ? "[secret]"
    : "";
  console.log(`${ts} ${req.method} ${req.url} ${auth}`);
  next();
});

// Initialize Litemetrics collector
const DB_ADAPTER = (process.env.DB_ADAPTER || "clickhouse") as "clickhouse" | "mongodb";
const DATABASE_URL =
  process.env.DATABASE_URL ||
  (DB_ADAPTER === "clickhouse"
    ? "http://localhost:8123"
    : "mongodb://localhost:27017/litemetrics");

const collector = await createCollector({
  db: { adapter: DB_ADAPTER, url: DATABASE_URL },
  adminSecret: process.env.LITEMETRICS_ADMIN_SECRET,
  geoip: false,
  trustProxy: true,
});

// Mount handlers
const collectHandler = collector.handler();
const queryHandler = collector.queryHandler();
const eventsHandler = collector.eventsHandler();
const usersHandler = collector.usersHandler();
const sitesHandler = collector.sitesHandler();

app.all("/api/collect", async (req, res) => {
  await collectHandler(req, res);
});

app.all("/api/stats", async (req, res) => {
  await queryHandler(req, res);
});

app.all("/api/events", async (req, res) => {
  await eventsHandler(req, res);
});

app.all("/api/users", async (req, res) => {
  await usersHandler(req, res);
});
app.all("/api/users/{*path}", async (req, res) => {
  await usersHandler(req, res);
});

app.all("/api/sites", async (req, res) => {
  await sitesHandler(req, res);
});
app.all("/api/sites/{*path}", async (req, res) => {
  await sitesHandler(req, res);
});

// Serve tracker script
app.get("/litemetrics.js", (_req, res) => {
  res.sendFile(
    join(import.meta.dirname, "../../packages/tracker/dist/litemetrics.global.js")
  );
});

// Serve the demo HTML page
app.get("/", (_req, res) => {
  res.sendFile(join(import.meta.dirname, "index.html"));
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Litemetrics demo running at http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /api/collect    - Event collection (public)`);
  console.log(`  GET  /api/stats      - Query analytics (secret key required)`);
  console.log(`  GET  /api/events     - List events (secret key required)`);
  console.log(`  GET  /api/users      - List users (secret key required)`);
  console.log(
    `  ALL  /api/sites      - Site management (admin secret required)`
  );
  console.log(`  GET  /               - Demo page\n`);
  if (!process.env.LITEMETRICS_ADMIN_SECRET) {
    console.log(
      `  Warning: LITEMETRICS_ADMIN_SECRET not set - site management disabled`
    );
    console.log(`  Set it: LITEMETRICS_ADMIN_SECRET=my-secret bun run dev\n`);
  }
});
