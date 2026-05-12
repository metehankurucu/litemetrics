import { Link } from 'react-router-dom';
import { MarketingLayout } from '../../components/MarketingLayout';

export default function Umami() {
  return (
    <MarketingLayout
      title="Litemetrics vs Umami - Self-hosted analytics, two angles"
      description="Umami is a popular self-hosted Plausible alternative. Litemetrics is an embedded analytics SDK for SaaS products. How they overlap, where they diverge, and how to pick."
      path="/vs/umami"
      breadcrumbs={[
        { name: 'Home', url: '/' },
        { name: 'vs Umami', url: '/vs/umami' },
      ]}
    >
      <h1>Litemetrics vs Umami</h1>
      <p className="lead">
        Umami and Litemetrics both compete in the self-hosted analytics
        space, but solve different problems. Umami is a polished,
        first-party analytics replacement for Google Analytics. Litemetrics
        is built for embedding analytics into your SaaS for your customers.
      </p>

      <h2>What Umami does well</h2>
      <ul>
        <li>
          Clean, fast first-party dashboard. Polished UX out of the box.
        </li>
        <li>
          Multi-website support per account: you can manage many of your
          own sites from one Umami install.
        </li>
        <li>
          Easy Postgres or MySQL backend. Single Docker image to deploy.
        </li>
        <li>
          MIT licensed and community-supported.
        </li>
      </ul>

      <h2>What Umami does not do</h2>
      <p>
        Umami is not designed to be embedded into <em>another</em> product.
        Its dashboard is a standalone web app. If you want to give your
        customers analytics inside your SaaS, you end up either iframing
        Umami (poor UX, theming limited) or rebuilding the dashboard from
        their query API by hand.
      </p>

      <h2>Side by side</h2>
      <table>
        <thead>
          <tr>
            <th>Capability</th>
            <th>Umami</th>
            <th>Litemetrics</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>License</td>
            <td>MIT</td>
            <td>MIT</td>
          </tr>
          <tr>
            <td>Self-hostable</td>
            <td>Yes</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Cookie-free</td>
            <td>Yes</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Tracker bundle size</td>
            <td>~2 KB</td>
            <td>~3.5 KB</td>
          </tr>
          <tr>
            <td>Database</td>
            <td>Postgres or MySQL</td>
            <td>ClickHouse, Postgres, or MongoDB</td>
          </tr>
          <tr>
            <td>Embeddable React dashboard</td>
            <td>No</td>
            <td>Yes (native components)</td>
          </tr>
          <tr>
            <td>White-label theming</td>
            <td>Limited</td>
            <td>10 presets + CSS variables</td>
          </tr>
          <tr>
            <td>Multi-tenant model</td>
            <td>One website = one site_id, no per-customer isolation primitives</td>
            <td>site_id isolation built in, per-customer secret keys</td>
          </tr>
          <tr>
            <td>Best for</td>
            <td>Your own websites</td>
            <td>Analytics shipped inside your SaaS</td>
          </tr>
        </tbody>
      </table>

      <h2>How to choose</h2>
      <p>Pick Umami if:</p>
      <ul>
        <li>You want to replace Google Analytics for your own sites.</li>
        <li>You do not need to embed analytics into a product you sell.</li>
        <li>You want a polished standalone dashboard with minimal setup.</li>
      </ul>
      <p>Pick Litemetrics if:</p>
      <ul>
        <li>
          You are building a SaaS where customers expect to see analytics on
          their own data.
        </li>
        <li>
          You want the dashboard to look like a native part of your product,
          not a separate tool.
        </li>
        <li>
          You need ClickHouse for high-throughput aggregations, or Postgres
          for operational simplicity.
        </li>
      </ul>

      <h2>Can I run both?</h2>
      <p>
        Yes. Many teams run Umami (or Plausible) for their marketing site
        and Litemetrics inside the product. The two do not collide.
      </p>

      <p>
        See the{' '}
        <Link to="/for/embedded-analytics">embedded analytics use case</Link>{' '}
        for a deeper look at the multi-tenant model, or run the{' '}
        <Link to="/docs/quickstart">Quickstart</Link> to get a local
        instance going.
      </p>
    </MarketingLayout>
  );
}
