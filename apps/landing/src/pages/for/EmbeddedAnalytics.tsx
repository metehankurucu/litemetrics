import { Link } from 'react-router-dom';
import { MarketingLayout } from '../../components/MarketingLayout';

export default function EmbeddedAnalytics() {
  return (
    <MarketingLayout
      title="Embedded analytics SDK - White-label dashboards inside your app"
      description="Embedded analytics is when the dashboard lives inside your product, not a separate tool. Litemetrics is an open-source SDK for shipping customer-facing analytics in days, not months."
      path="/for/embedded-analytics"
      breadcrumbs={[
        { name: 'Home', url: '/' },
        { name: 'For embedded analytics', url: '/for/embedded-analytics' },
      ]}
    >
      <h1>Embedded analytics SDK</h1>
      <p className="lead">
        Embedded analytics is the practice of putting analytics{' '}
        <em>inside</em> your product, scoped to each customer's data,
        styled like a native part of your app. It used to require building
        the dashboard from scratch or shelling out to a paid platform.
        Litemetrics makes it a one-component install.
      </p>

      <h2>What "embedded" actually means</h2>
      <p>
        First-party analytics tools (Plausible, Umami, GA) show you data
        about <em>your</em> traffic to <em>your</em> site. The dashboard is
        a tool you log into, separately from your product.
      </p>
      <p>
        Embedded analytics inverts this. The dashboard is part of your
        product. Your customer logs into your app, navigates to their
        Analytics tab, and sees data about their resource (their store,
        their link, their page) inside your UI, with your colors and your
        navigation around it.
      </p>
      <p>
        Three things have to be true for that to work:
      </p>
      <ol>
        <li>
          <strong>Multi-tenancy</strong>: each customer sees only their own
          data. Server-enforced, not just client-filtered.
        </li>
        <li>
          <strong>White-label theming</strong>: the dashboard takes your
          brand colors, fonts, and dark/light mode. No iframe, no foreign
          design system.
        </li>
        <li>
          <strong>API-first or component-first</strong>: either you query
          the data and render it, or someone hands you components that
          already do.
        </li>
      </ol>
      <p>Litemetrics gives you the components.</p>

      <h2>The architecture</h2>
      <p>Four parts, all open source, all MIT:</p>
      <ul>
        <li>
          <code>@litemetrics/tracker</code>: the 3.5 KB browser script that
          ships pageviews and events to your collector.
        </li>
        <li>
          <code>@litemetrics/node</code>: the Express-compatible collector,
          query API, and site CRUD. Adapters for ClickHouse, Postgres, and
          MongoDB.
        </li>
        <li>
          <code>@litemetrics/react</code>: provider and hooks for tracking
          inside React/Next.js apps.
        </li>
        <li>
          <code>@litemetrics/ui</code>: the white-label React dashboard
          component you embed in your product.
        </li>
      </ul>

      <h2>Multi-tenant by default</h2>
      <p>
        Every event is tagged with a <code>siteId</code> at write time and
        every query is filtered by <code>siteId</code> at read time. The
        secret key required to read data is per-site, so even if a customer
        guessed another customer's <code>siteId</code> they would still get
        a 403. There is no shared global view; isolation is the default.
      </p>

      <h2>White-label theming</h2>
      <p>
        Theming is two layers. The dashboard ships with 10 named presets
        (<code>midnight</code>, <code>arctic</code>, <code>candy</code>,{' '}
        <code>terminal</code>, etc.) you select via prop. Underneath, every
        color, radius, and spacing token is a CSS custom property prefixed{' '}
        <code>--lm-</code>. To match your brand, override the variables in
        the parent scope:
      </p>
      <pre>
        <code>{`.your-app-shell {
  --lm-color-brand: #5b9eff;
  --lm-color-surface: #0f1218;
  --lm-radius-card: 12px;
  --lm-font-display: 'Your Font', sans-serif;
}`}</code>
      </pre>

      <h2>Drop-in usage</h2>
      <pre>
        <code>{`import {
  LitemetricsProvider,
  AnalyticsDashboard,
} from '@litemetrics/ui';

export function AnalyticsTab({ customer }) {
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

      <h2>What customers actually see</h2>
      <ul>
        <li>Pageviews, visitors, sessions, events as headline stats with deltas.</li>
        <li>Time series by hour, day, week, or month.</li>
        <li>Top pages, top referrers, top exit pages, page-to-page transitions.</li>
        <li>Geo (country and city), browser, OS, device breakdowns.</li>
        <li>Scroll depth and button click heatmaps.</li>
        <li>Custom event lists (whatever your tracker fires).</li>
        <li>Weekly cohort retention.</li>
      </ul>
      <p>
        All of it server-rendered against ClickHouse or Postgres, all of it
        scoped to that customer's <code>siteId</code>.
      </p>

      <h2>Why open source matters here</h2>
      <p>
        Embedded analytics tends to be a long-lived part of your product.
        You do not want a closed-source dependency that you cannot patch,
        that can change pricing, or that gets acquired and discontinued.
        Litemetrics is MIT licensed: you can fork it, embed it in
        commercial products, and you own your customers' data on your
        infrastructure. There is no upstream you have to negotiate with.
      </p>

      <h2>Get started</h2>
      <ul>
        <li>
          <Link to="/docs/quickstart">Quickstart</Link>: get a stack
          running locally in 5 minutes.
        </li>
        <li>
          <Link to="/docs/react">React integration</Link>: tracker provider
          and dashboard component patterns.
        </li>
        <li>
          <Link to="/for/saas">For SaaS</Link>: real-world examples of
          where this shape fits.
        </li>
      </ul>
    </MarketingLayout>
  );
}
