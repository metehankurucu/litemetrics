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
          <strong>Vacuum</strong>: events are insert-only with TTL deletions
          (when configured). Postgres autovacuum keeps things tidy without
          intervention.
        </li>
        <li>
          <strong>Partitioning</strong>: for multi-tenant deployments above
          a few million events per site per month, declarative partitioning
          on <code>timestamp</code> reduces query and vacuum costs. Add it
          via a manual migration; the adapter does not require it.
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
