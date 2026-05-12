import { Link } from 'react-router-dom';
import { DocLayout } from '../../components/DocLayout';

export default function ClickhouseSetup() {
  return (
    <DocLayout
      title="Self-host Litemetrics with ClickHouse"
      description="Run the Litemetrics analytics server backed by ClickHouse. Docker Compose, environment variables, schema layout, and GeoIP enrichment, with scaling notes."
      path="/docs/clickhouse-setup"
      breadcrumbs={[
        { name: 'Home', url: '/' },
        { name: 'Docs', url: '/docs/quickstart' },
        { name: 'ClickHouse', url: '/docs/clickhouse-setup' },
      ]}
    >
      <h1>Self-host with ClickHouse</h1>
      <p className="lead">
        ClickHouse is the recommended Litemetrics adapter when you expect
        more than a few million events per month. It handles the columnar
        aggregations the analytics dashboard relies on (top pages, top
        referrers, retention cohorts) at sub-second latency, even on a single
        modest VM.
      </p>

      <h2>1. Start the stack</h2>
      <p>
        The repo ships a <code>docker-compose.yml</code> that brings up
        ClickHouse and the collector together, with healthchecks and named
        volumes.
      </p>
      <pre>
        <code>{`git clone https://github.com/metehankurucu/litemetrics.git
cd litemetrics
docker compose up -d`}</code>
      </pre>
      <p>
        Services exposed:
      </p>
      <ul>
        <li>
          <code>http://localhost:3002</code>: collector + query API.
        </li>
        <li>
          <code>http://localhost:8123</code>: ClickHouse HTTP interface.
        </li>
        <li>
          <code>localhost:9000</code>: ClickHouse native protocol.
        </li>
      </ul>

      <h2>2. Configuration</h2>
      <p>
        The collector reads its configuration from environment variables. The
        defaults are sensible for local development; override these in
        production.
      </p>
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
            <td>Set to <code>clickhouse</code> explicitly in production.</td>
          </tr>
          <tr>
            <td><code>CLICKHOUSE_URL</code></td>
            <td><code>http://localhost:8123</code></td>
            <td>Use the internal Docker hostname (<code>http://clickhouse:8123</code>) inside Compose.</td>
          </tr>
          <tr>
            <td><code>ADMIN_SECRET</code></td>
            <td><code>admin</code></td>
            <td>Required for <code>/api/sites</code> CRUD. Rotate before exposing publicly.</td>
          </tr>
          <tr>
            <td><code>GEOIP</code></td>
            <td><code>true</code></td>
            <td>Toggles MaxMind GeoLite2 country and city enrichment.</td>
          </tr>
          <tr>
            <td><code>TRUST_PROXY</code></td>
            <td><code>true</code></td>
            <td>Required when running behind a reverse proxy or load balancer.</td>
          </tr>
          <tr>
            <td><code>PORT</code></td>
            <td><code>3002</code></td>
            <td>Port the Express server binds to.</td>
          </tr>
        </tbody>
      </table>

      <h2>3. Schema</h2>
      <p>
        Tables are created automatically on first boot. You do not run
        migrations.
      </p>
      <ul>
        <li>
          <code>events</code> (<code>MergeTree</code>): one row per event,
          partitioned by month, ordered by{' '}
          <code>(site_id, toDate(timestamp), timestamp)</code>.
        </li>
        <li>
          <code>sites</code> (<code>ReplacingMergeTree</code>): one row per
          site, soft-deletes via a <code>deleted_at</code> column.
        </li>
        <li>
          <code>identity</code>: maps anonymous visitor ids to identified
          user ids for cross-session merging.
        </li>
      </ul>

      <h2>4. GeoIP</h2>
      <p>
        With <code>GEOIP=true</code> the collector resolves country and city
        per event using a bundled MaxMind GeoLite2 database. The dataset is
        small (~70MB) and shipped with the Docker image. Disable it with{' '}
        <code>GEOIP=false</code> if you do not need geographic breakdowns or
        prefer to enrich elsewhere.
      </p>

      <h2>5. Scaling notes</h2>
      <p>
        A single ClickHouse node on a 2 vCPU / 4GB instance comfortably
        ingests over 100M events per month with sub-second dashboard
        queries. When you outgrow that:
      </p>
      <ul>
        <li>
          Vertical scale ClickHouse first; analytics workloads benefit
          disproportionately from more RAM and fast NVMe.
        </li>
        <li>
          Move the collector to a separate container (or three behind a load
          balancer); event ingestion is stateless.
        </li>
        <li>
          For multi-region deployments, run a collector per region and a
          single ClickHouse cluster with replication. The collector is
          read-light, write-only.
        </li>
      </ul>

      <h2>6. Backups</h2>
      <p>
        Use ClickHouse's built-in <code>BACKUP</code> command or rely on
        volume snapshots from your provider (AWS EBS, GCP PD, etc.). The{' '}
        <code>events</code> table compresses extremely well (typically 10x
        to 30x) so backups stay small.
      </p>

      <h2>Switching to Postgres</h2>
      <p>
        If you would rather run Litemetrics on the database you already
        operate, the Postgres adapter has full feature parity. See{' '}
        <Link to="/docs/postgres-setup">Postgres setup</Link>.
      </p>
    </DocLayout>
  );
}
