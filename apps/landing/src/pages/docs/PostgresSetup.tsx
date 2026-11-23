import { Link } from 'react-router-dom';
import { DocLayout } from '../../components/DocLayout';

export default function PostgresSetup() {
  return (
    <DocLayout
      title="Self-host Litemetrics with Postgres"
      description="Run Litemetrics on a single Postgres database with full feature parity to ClickHouse. Configuration, schema, indexes, and when to pick Postgres over ClickHouse."
      path="/docs/postgres-setup"
      breadcrumbs={[
        { name: 'Home', url: '/' },
        { name: 'Docs', url: '/docs/quickstart' },
        { name: 'Postgres', url: '/docs/postgres-setup' },
      ]}
    >
      <h1>Self-host with Postgres</h1>
      <p className="lead">
        The Postgres adapter is the simplest way to run Litemetrics if you
        already operate a Postgres database. It has full feature parity with
        the ClickHouse adapter (every metric, time series, top-N query, and
        retention cohort returns identical results) and adds zero new
        infrastructure to your stack.
      </p>

      <h2>When to pick Postgres</h2>
      <ul>
        <li>You already run Postgres for your app and want one less moving piece.</li>
        <li>You expect under ~10M events per month per site.</li>
        <li>You value operational simplicity over peak query throughput.</li>
        <li>You want analytics data in the same backup, replication, and observability story as your app data.</li>
      </ul>
      <p>
        For larger volumes or sub-second top-N queries on hundreds of
        millions of events, prefer{' '}
        <Link to="/docs/clickhouse-setup">ClickHouse</Link>.
      </p>

      <h2>1. Install</h2>
      <p>
        Add the collector to an Express app and point it at your Postgres
        instance:
      </p>
      <pre>
        <code>{`npm install @litemetrics/node`}</code>
      </pre>
      <pre>
        <code>{`import express from 'express';
import { createCollector } from '@litemetrics/node';

const app = express();
app.use(express.json());

const collector = await createCollector({
  db: {
    adapter: 'postgres',
    url: process.env.DATABASE_URL,
  },
  adminSecret: process.env.ADMIN_SECRET,
  geoip: true,
});

app.post('/api/collect', collector.handler());
app.get('/api/stats', collector.queryHandler());
app.all('/api/events', collector.eventsHandler());
app.all('/api/users/*', collector.usersHandler());
app.all('/api/sites/*', collector.sitesHandler());

app.listen(3002);`}</code>
      </pre>

      <h2>2. Or run the bundled image</h2>
      <p>
        The Docker image works the same way; pass <code>DB_ADAPTER</code> and{' '}
        <code>POSTGRES_URL</code>:
      </p>
      <pre>
        <code>{`docker run -d \\
  -e DB_ADAPTER=postgres \\
  -e POSTGRES_URL=postgres://user:pass@db.example.com:5432/litemetrics \\
  -e ADMIN_SECRET=change-me \\
  -p 3002:3002 \\
  ghcr.io/metehankurucu/litemetrics:latest`}</code>
      </pre>

      <h2>3. Configuration</h2>
      <table>
        <thead>
          <tr>
            <th>Variable</th>
            <th>Default</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>DB_ADAPTER</code></td>
            <td><code>clickhouse</code></td>
            <td>Set to <code>postgres</code>.</td>
          </tr>
          <tr>
            <td><code>POSTGRES_URL</code></td>
            <td><code>postgres://postgres:postgres@localhost:5432/litemetrics</code></td>
            <td>Standard Postgres connection string. SSL params supported.</td>
          </tr>
          <tr>
            <td><code>ADMIN_SECRET</code></td>
            <td><code>admin</code></td>
            <td>Required for site CRUD.</td>
          </tr>
          <tr>
            <td><code>GEOIP</code></td>
            <td><code>true</code></td>
            <td>MaxMind GeoLite2 country and city resolution.</td>
          </tr>
          <tr>
            <td><code>TRUST_PROXY</code></td>
            <td><code>true</code></td>
            <td>Set when running behind a load balancer.</td>
          </tr>
          <tr>
            <td><code>EVENT_RETENTION_DAYS</code></td>
            <td><code>0</code> (off)</td>
            <td>
              Opt-in. Permanently deletes raw events older than this many
              days (30 to 36500). See{' '}
              <a href="#event-retention">Event retention</a>.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>4. Schema</h2>
      <p>
        Tables are created on first boot. The Postgres adapter uses native
        types where Postgres is good at them:
      </p>
      <ul>
        <li>
          <code>events</code>: one row per event. Properties stored as{' '}
          <code>jsonb</code> for queryable extra fields.
        </li>
        <li>
          Primary index on <code>(site_id, timestamp)</code> for fast range
          scans (the dashboard's hottest query pattern).
        </li>
        <li>
          Secondary indexes on <code>(site_id, type, timestamp)</code> for
          filtered breakdowns.
        </li>
        <li>
          <code>sites</code>: soft-delete via <code>deleted_at</code>.
        </li>
        <li>
          <code>identity</code>: visitor-to-user merge map.
        </li>
      </ul>

      <h2>5. Operating notes</h2>
      <ul>
        <li>
          <strong>Connection pool</strong>: the adapter uses{' '}
          <code>pg.Pool</code>. The default pool size of 10 is enough for
          most workloads; bump it if your collector runs behind heavy
          concurrent traffic.
        </li>
        <li>
          <strong>Vacuum</strong>: events are insert-only unless you enable{' '}
          <a href="#event-retention">event retention</a>, which deletes old
          rows. Postgres autovacuum keeps things tidy without intervention
          and reuses the space freed by deletions.
        </li>
        <li>
          <strong>Partitioning</strong>: for multi-tenant deployments above
          a few million events per site per month, declarative partitioning
          on <code>timestamp</code> reduces query and vacuum costs. Add it
          via a manual migration; the adapter does not require it.
        </li>
      </ul>

      <h2 id="event-retention">Event retention (opt-in)</h2>
      <p>
        Raw events are kept forever by default. Set{' '}
        <code>EVENT_RETENTION_DAYS</code> (or pass{' '}
        <code>eventRetentionDays</code> in the <code>db</code> option of{' '}
        <code>createCollector</code>) to delete raw events older than that
        many days. <strong>Deletions are permanent.</strong>
      </p>
      <ul>
        <li>
          <strong>What is deleted</strong>: event rows older than N days for
          every site and every event type, including <code>identify</code>,
          and bot-flagged rows too. It keys on each event's client-supplied{' '}
          <code>timestamp</code>, not on ingestion time. Sites, the identity
          map and the aggregate snapshot tables are not touched.
        </li>
        <li>
          <strong>Scope</strong>: Postgres only, off by default. Accepted
          values are whole numbers from 30 to 36500; unset, empty or{' '}
          <code>0</code> is off, and any other value keeps it off and logs a
          warning.
        </li>
        <li>
          <strong>Pacing</strong>: deletion begins 10 minutes after boot, not
          at boot. A sweep runs every 10 minutes and deletes at most 20,000
          rows plus one window of at most 5,000 rows (one site's oldest hour
          of events, in its own transaction under a 30 second statement
          timeout), so a large backlog clears gradually. The pace is per
          process: run one process per database, because k processes on one
          database multiply the pace by k.
        </li>
        <li>
          <strong>Logs</strong>: each boot prints an{' '}
          <code>Event retention:</code> status line, and a sweep that deleted
          rows or failed prints one{' '}
          <code>[event-retention] sweep ...</code> line.
        </li>
        <li>
          <strong>What changes for readers</strong>: user detail lifetime
          counters and first-seen only count retained events; a user or
          visitor with no retained events returns 404 from the user detail
          endpoint while its identity mapping stays; cohort weeks and custom
          date ranges older than N days come back empty; any preset period
          or custom range reaching back past N days counts only retained
          events (for example <code>90d</code> when N is below 90), and so
          does the previous-period comparison, which for <code>90d</code>{' '}
          looks 90 to 180 days back: while that window is partly deleted,{' '}
          <code>previousTotal</code> is too low and{' '}
          <code>changePercent</code> overstates growth; the identity
          backfill script only sees <code>identify</code> events within N
          days.
        </li>
        <li>
          <strong>Disk space</strong>: deleted space is reused by Postgres
          after autovacuum but is not returned to the operating system.
        </li>
        <li>
          <strong>First run</strong>: make sure WAL settings and free disk
          can absorb the first backlog, watch the log lines and disk, and
          set <code>0</code> (or unset the variable) to stop. Shortening the
          period takes effect on the next sweep; lengthening it does not
          bring deleted data back.
        </li>
      </ul>

      <h2>6. Migrating to ClickHouse later</h2>
      <p>
        If you outgrow Postgres, you can switch to ClickHouse without
        changing application code; only the <code>DB_ADAPTER</code> and{' '}
        <code>CLICKHOUSE_URL</code> env vars change. A one-shot export
        script is provided in the repo for migrating historical events.
      </p>

      <h2>Where to next</h2>
      <ul>
        <li>
          <Link to="/docs/quickstart">Quickstart</Link>: end-to-end setup
          including the dashboard.
        </li>
        <li>
          <Link to="/docs/clickhouse-setup">ClickHouse setup</Link>:
          comparison and switch path.
        </li>
        <li>
          <Link to="/vs/posthog">vs PostHog</Link>: when a lighter Postgres
          stack beats a heavyweight platform.
        </li>
      </ul>
    </DocLayout>
  );
}
