import { Link } from 'react-router-dom';
import { DocLayout } from '../../components/DocLayout';

export default function Quickstart() {
  return (
    <DocLayout
      title="Litemetrics Quickstart - Self-hosted analytics in 5 minutes"
      description="Get Litemetrics running locally and embed analytics into your app. Five steps from npm install to a working dashboard, with Docker, Railway, and bare-metal options."
      path="/docs/quickstart"
      breadcrumbs={[
        { name: 'Home', url: '/' },
        { name: 'Docs', url: '/docs/quickstart' },
        { name: 'Quickstart', url: '/docs/quickstart' },
      ]}
    >
      <h1>Quickstart</h1>
      <p className="lead">
        Litemetrics has four moving parts: a tracker that runs in your users'
        browsers, a server that collects events, a database that stores them
        (ClickHouse, Postgres, or MongoDB), and a React dashboard you embed
        into your product. This guide gets all four running in about five
        minutes.
      </p>

      <h2>1. Run the collector with Docker</h2>
      <p>
        The fastest path is the bundled Docker Compose stack. It starts
        ClickHouse and the Litemetrics server together, with healthchecks and
        persistent volumes already wired up.
      </p>
      <pre>
        <code>{`git clone https://github.com/metehankurucu/litemetrics.git
cd litemetrics
docker compose up -d`}</code>
      </pre>
      <p>
        The collector listens on <code>http://localhost:3002</code>. ClickHouse
        is exposed on <code>8123</code>. To use Postgres instead, see the{' '}
        <Link to="/docs/postgres-setup">Postgres setup</Link> guide; to use
        MongoDB, run with the <code>--profile mongodb</code> flag.
      </p>
      <p>
        Prefer one-click hosting? Deploy the same image to Railway with the{' '}
        <a
          href="https://railway.com/template/OQI8lX?referralCode=LpQIoM"
          target="_blank"
          rel="noopener noreferrer"
        >
          Railway template
        </a>
        . You will get an HTTPS URL in under a minute.
      </p>

      <h2>2. Create a site</h2>
      <p>
        Sites are how Litemetrics isolates tenants. Each site has its own
        public <code>siteId</code> (used by the tracker) and a private secret
        key (used to read stats). Create one with the admin endpoint:
      </p>
      <pre>
        <code>{`curl -X POST http://localhost:3002/api/sites \\
  -H "X-Litemetrics-Admin-Secret: admin" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "My App", "hostnames": ["myapp.com"]}'`}</code>
      </pre>
      <p>
        The response includes the <code>siteId</code> and{' '}
        <code>secretKey</code>. Save the <code>secretKey</code> in your
        backend secrets store; it is what the dashboard uses to read stats
        for that tenant.
      </p>

      <h2>3. Add the tracker to your site</h2>
      <p>
        The browser tracker is under 3.5KB gzipped, loads asynchronously, and
        auto-tracks pageviews, sessions, scroll depth, button clicks, and
        outbound links.
      </p>
      <pre>
        <code>{`<script src="http://localhost:3002/litemetrics.js" defer></script>
<script>
  Litemetrics.createTracker({
    siteId: 'YOUR_SITE_ID',
    endpoint: 'http://localhost:3002/api/collect',
  });
</script>`}</code>
      </pre>
      <p>
        Using React or Next.js? See the{' '}
        <Link to="/docs/react">React integration guide</Link> for the
        idiomatic provider and hooks setup.
      </p>

      <h2>4. Verify events are flowing</h2>
      <p>
        Open the page in a browser. The tracker fires a pageview on load and
        a session event on first interaction. Confirm with:
      </p>
      <pre>
        <code>{`curl "http://localhost:3002/api/stats?siteId=YOUR_SITE_ID&metric=pageviews&period=24h" \\
  -H "X-Litemetrics-Site-Secret: YOUR_SECRET_KEY"`}</code>
      </pre>
      <p>
        You should see a count greater than zero. If not, check that{' '}
        <code>hostnames</code> on the site allows the origin you are testing
        from, and that the tracker URL points to the right collector.
      </p>

      <h2>5. Embed the dashboard in your app</h2>
      <p>
        The dashboard is a React component. Drop it into any page in your
        product, pass the customer's <code>siteId</code>, and they get a full
        analytics view scoped to their data only.
      </p>
      <pre>
        <code>{`import {
  LitemetricsProvider,
  AnalyticsDashboard,
} from '@litemetrics/ui';

export function CustomerAnalytics({ customerId }) {
  return (
    <LitemetricsProvider
      baseUrl="https://your-server.com/api"
      siteId={customerId}
      secretKey={getSecretForCustomer(customerId)}
    >
      <AnalyticsDashboard theme="midnight" />
    </LitemetricsProvider>
  );
}`}</code>
      </pre>
      <p>
        That is it. Each customer sees only their own data, the dashboard
        respects your theme, and you never had to design a chart.
      </p>

      <h2>Where to next</h2>
      <ul>
        <li>
          <Link to="/docs/react">React integration</Link>: hooks, provider,
          Next.js App Router patterns.
        </li>
        <li>
          <Link to="/docs/clickhouse-setup">ClickHouse self-hosting</Link>:
          environment variables, schema, scaling, GeoIP.
        </li>
        <li>
          <Link to="/docs/postgres-setup">Postgres self-hosting</Link>:
          single-Postgres deployment with full feature parity.
        </li>
        <li>
          <Link to="/vs/plausible">Litemetrics vs Plausible</Link>: when each
          one is the right pick.
        </li>
      </ul>
    </DocLayout>
  );
}
