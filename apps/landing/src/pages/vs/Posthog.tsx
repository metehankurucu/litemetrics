import { Link } from 'react-router-dom';
import { MarketingLayout } from '../../components/MarketingLayout';

export default function Posthog() {
  return (
    <MarketingLayout
      title="Litemetrics vs PostHog - Lightweight embedded analytics"
      description="PostHog is a full product analytics platform with feature flags, session replay, and experiments. Litemetrics is a focused embedded analytics SDK. When the platform is overkill and a focused tool wins."
      path="/vs/posthog"
      breadcrumbs={[
        { name: 'Home', url: '/' },
        { name: 'vs PostHog', url: '/vs/posthog' },
      ]}
    >
      <h1>Litemetrics vs PostHog</h1>
      <p className="lead">
        PostHog is a full product analytics platform: events, funnels,
        cohorts, session replay, feature flags, experiments, surveys, and
        more. Litemetrics is the opposite philosophy: a focused embedded
        analytics SDK with one job (give your SaaS customers a dashboard
        inside your product). If you only need the dashboard, PostHog is
        often more than you want to operate.
      </p>

      <h2>Two different products</h2>
      <p>
        PostHog is a platform. It is hugely capable, well-funded, and the
        right pick when you want one tool that does product analytics,
        replays, flags, and experiments together. The price is operational
        weight: PostHog needs ClickHouse plus Kafka plus Zookeeper plus
        Postgres plus Redis plus a few services. The hosted plan starts
        free; serious usage runs into hundreds or thousands per month.
      </p>
      <p>
        Litemetrics is a single binary plus one database. There are no
        feature flags, no replays, no experiments. There is a tracker, a
        collector, a query API, and a React dashboard. That is the entire
        surface area.
      </p>

      <h2>Side by side</h2>
      <table>
        <thead>
          <tr>
            <th>Capability</th>
            <th>PostHog</th>
            <th>Litemetrics</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>License</td>
            <td>MIT (some features paid)</td>
            <td>MIT (everything)</td>
          </tr>
          <tr>
            <td>Self-host complexity</td>
            <td>ClickHouse + Kafka + Zookeeper + Postgres + Redis + multiple services</td>
            <td>One container + one DB (ClickHouse, Postgres, or MongoDB)</td>
          </tr>
          <tr>
            <td>Tracker bundle size</td>
            <td>~50 KB</td>
            <td>~3.5 KB</td>
          </tr>
          <tr>
            <td>Product features beyond analytics</td>
            <td>Replays, flags, experiments, surveys</td>
            <td>None (intentionally focused)</td>
          </tr>
          <tr>
            <td>Embeddable React dashboard</td>
            <td>iframe (no native React)</td>
            <td>Native React components, themeable</td>
          </tr>
          <tr>
            <td>White-label / multi-tenant for SaaS customers</td>
            <td>Possible with engineering effort</td>
            <td>Built in (site_id isolation, secret keys)</td>
          </tr>
          <tr>
            <td>Hosted pricing</td>
            <td>Free up to 1M events, then per-event tiered</td>
            <td>Self-host only (free)</td>
          </tr>
        </tbody>
      </table>

      <h2>When PostHog is the right pick</h2>
      <ul>
        <li>You want product analytics, replays, and feature flags in one platform.</li>
        <li>You are tracking your own product internally, not exposing analytics to customers.</li>
        <li>You have the operational appetite to run (or pay for) a multi-service stack.</li>
      </ul>

      <h2>When Litemetrics is the right pick</h2>
      <ul>
        <li>
          The customer-facing analytics dashboard <em>is</em> the use case,
          not internal product analytics.
        </li>
        <li>
          You want one container plus one database, not five services.
        </li>
        <li>
          Bundle size matters because you ship the tracker to your users
          (3.5 KB vs 50 KB on a slow connection makes a real LCP
          difference).
        </li>
        <li>You want native React components for the dashboard, not an iframe.</li>
      </ul>

      <h2>Can I run both?</h2>
      <p>
        Yes. A common pattern is PostHog for internal product analytics
        (your team) and Litemetrics for external customer-facing analytics
        (your users seeing their own data). The two have non-overlapping
        jobs.
      </p>

      <p>
        Try the{' '}
        <a href="https://demo.litemetrics.dev" target="_blank" rel="noopener noreferrer">
          live demo
        </a>{' '}
        or jump to{' '}
        <Link to="/docs/quickstart">Quickstart</Link>.
      </p>
    </MarketingLayout>
  );
}
