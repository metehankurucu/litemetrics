import { Link } from 'react-router-dom';
import { MarketingLayout } from '../../components/MarketingLayout';

export default function Saas() {
  return (
    <MarketingLayout
      title="Embedded analytics for SaaS - Ship customer dashboards in days"
      description="Litemetrics gives every SaaS customer their own analytics dashboard. Multi-tenant by default, white-label themed, deployed on your infrastructure. Stop building charts and ship the feature."
      path="/for/saas"
      breadcrumbs={[
        { name: 'Home', url: '/' },
        { name: 'For SaaS', url: '/for/saas' },
      ]}
    >
      <h1>Embedded analytics for SaaS products</h1>
      <p className="lead">
        Almost every B2B SaaS product reaches the same point. Customers
        start asking, "How many people clicked my link this week? Which
        country are my visitors from? Which pages convert?" Litemetrics is
        the answer that does not require you to spend a quarter building
        charts.
      </p>

      <h2>The problem this solves</h2>
      <p>
        You are building a product where customers create things (sites,
        forms, links, products, posts, surveys, anything) and they want to
        see how those things perform. You have three options:
      </p>
      <ol>
        <li>
          <strong>Build it yourself.</strong> Pick a charting library, design
          a dashboard, build an aggregation pipeline, deal with
          multi-tenancy, write retention queries. Three engineer-months
          minimum.
        </li>
        <li>
          <strong>Iframe a third-party tool</strong> (Plausible, Umami,
          GA). Looks foreign, breaks your design system, leaks customer
          data to a vendor, exposes your customers to that vendor's
          terms.
        </li>
        <li>
          <strong>Embed Litemetrics.</strong> Drop one component into your
          app, pass a customer's <code>siteId</code>, ship the feature
          tomorrow.
        </li>
      </ol>

      <h2>What you get</h2>
      <ul>
        <li>
          <strong>A pre-built React dashboard</strong>: stat cards, time
          series, top pages, top referrers, geo, browser, device, scroll
          depth, button clicks. Native components, not iframes.
        </li>
        <li>
          <strong>Multi-tenant by default</strong>: every customer has a{' '}
          <code>siteId</code> and a secret. Their data is scoped on the
          server side; you cannot accidentally leak.
        </li>
        <li>
          <strong>Themeable</strong>: 10 built-in presets and full CSS
          variable control. Match your brand without forking the component.
        </li>
        <li>
          <strong>Self-hosted</strong>: runs on your infra. ClickHouse,
          Postgres, or MongoDB. No vendor lock-in, no per-event pricing.
        </li>
        <li>
          <strong>Light tracker</strong>: 3.5 KB gzipped. Your customers'
          users do not pay an LCP cost for analytics they did not ask for.
        </li>
      </ul>

      <h2>The integration shape</h2>
      <p>
        Three pieces wire up in your app. The pattern is the same whether
        you have ten customers or ten thousand.
      </p>

      <h3>1. Provision a site per customer</h3>
      <p>
        When a customer signs up (or whenever they create the resource you
        want analytics for), call your collector's site CRUD endpoint to
        provision a site:
      </p>
      <pre>
        <code>{`async function createCustomerSite(customer) {
  const res = await fetch('https://analytics.yourapp.com/api/sites', {
    method: 'POST',
    headers: {
      'X-Litemetrics-Admin-Secret': process.env.LITEMETRICS_ADMIN_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: customer.name,
      hostnames: [customer.subdomain + '.yourapp.com'],
    }),
  });
  const { siteId, secretKey } = await res.json();
  await db.customers.update(customer.id, {
    litemetricsSiteId: siteId,
    litemetricsSecret: secretKey,
  });
}`}</code>
      </pre>

      <h3>2. Drop the tracker on your customer's storefront / page / product</h3>
      <p>
        Whatever your customer publishes, include the tracker pointed at
        their <code>siteId</code>:
      </p>
      <pre>
        <code>{`<script src="https://analytics.yourapp.com/litemetrics.js" defer></script>
<script>
  Litemetrics.createTracker({
    siteId: '{{ customer.litemetricsSiteId }}',
    endpoint: 'https://analytics.yourapp.com/api/collect',
  });
</script>`}</code>
      </pre>

      <h3>3. Render the dashboard inside your product</h3>
      <pre>
        <code>{`import {
  LitemetricsProvider,
  AnalyticsDashboard,
} from '@litemetrics/ui';

export function CustomerAnalytics({ customer }) {
  return (
    <LitemetricsProvider
      baseUrl="https://analytics.yourapp.com/api"
      siteId={customer.litemetricsSiteId}
      secretKey={customer.litemetricsSecret}
    >
      <AnalyticsDashboard theme="midnight" />
    </LitemetricsProvider>
  );
}`}</code>
      </pre>

      <h2>The economics</h2>
      <p>
        Hosted analytics platforms (PostHog, Mixpanel, Amplitude) charge
        per event. At 100 customers each generating 50,000 events a month,
        that is 5M events. On most platforms that lands you on a four-figure
        monthly bill before you have made a dollar from those customers.
        Litemetrics is one VM and one database; the marginal cost per
        customer is essentially zero.
      </p>

      <h2>Real-world fit</h2>
      <p>This shape is everywhere:</p>
      <ul>
        <li>Link-in-bio tools (every link gets analytics).</li>
        <li>E-commerce builders (every store gets analytics).</li>
        <li>CMS / page builders (every site gets analytics).</li>
        <li>Form / survey tools (every form gets analytics).</li>
        <li>Booking / scheduling tools (every page gets analytics).</li>
        <li>Newsletter / blog platforms (every post gets analytics).</li>
        <li>Portfolio / creator platforms (every profile gets analytics).</li>
      </ul>

      <h2>Get started</h2>
      <ul>
        <li>
          <Link to="/docs/quickstart">Quickstart</Link>: 5 minutes from
          clone to running stack.
        </li>
        <li>
          <Link to="/for/embedded-analytics">Embedded analytics deep
          dive</Link>: the full multi-tenant pattern.
        </li>
        <li>
          <a href="https://demo.litemetrics.dev" target="_blank" rel="noopener noreferrer">
            Live demo
          </a>
          : see what your customers will see.
        </li>
      </ul>
    </MarketingLayout>
  );
}
