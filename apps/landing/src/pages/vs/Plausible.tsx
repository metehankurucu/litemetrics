import { Link } from 'react-router-dom';
import { MarketingLayout } from '../../components/MarketingLayout';

export default function Plausible() {
  return (
    <MarketingLayout
      title="Litemetrics vs Plausible - Embedded analytics vs first-party"
      description="Plausible is a lightweight first-party analytics tool. Litemetrics is an embedded analytics SDK for SaaS products. Side-by-side comparison of features, pricing, and the right pick for your use case."
      path="/vs/plausible"
      breadcrumbs={[
        { name: 'Home', url: '/' },
        { name: 'vs Plausible', url: '/vs/plausible' },
      ]}
    >
      <h1>Litemetrics vs Plausible</h1>
      <p className="lead">
        Plausible and Litemetrics both ship lightweight, cookieless,
        open-source analytics. The difference is the audience. Plausible is
        a first-party analytics tool you use to measure your own site.
        Litemetrics is an embedded analytics SDK you ship inside your SaaS
        so each of your customers gets their own dashboard.
      </p>

      <h2>The one-line distinction</h2>
      <ul>
        <li>
          <strong>Plausible</strong>: "I want to see how my marketing site
          is doing."
        </li>
        <li>
          <strong>Litemetrics</strong>: "I want my SaaS customers to see
          analytics inside my product."
        </li>
      </ul>

      <h2>Side by side</h2>
      <table>
        <thead>
          <tr>
            <th>Capability</th>
            <th>Plausible</th>
            <th>Litemetrics</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Open source / MIT</td>
            <td>AGPL</td>
            <td>MIT</td>
          </tr>
          <tr>
            <td>Self-hostable</td>
            <td>Yes (community edition)</td>
            <td>Yes (Docker / Railway / npm)</td>
          </tr>
          <tr>
            <td>Cookie-free</td>
            <td>Yes</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Tracker bundle size</td>
            <td>~1 KB</td>
            <td>~3.5 KB</td>
          </tr>
          <tr>
            <td>Embeddable React dashboard</td>
            <td>No (iframe only)</td>
            <td>Yes (native React components, themeable)</td>
          </tr>
          <tr>
            <td>Multi-tenant out of the box</td>
            <td>Per-site only</td>
            <td>Per-customer site_id isolation built in</td>
          </tr>
          <tr>
            <td>White-label theming</td>
            <td>No</td>
            <td>10 presets + CSS variables</td>
          </tr>
          <tr>
            <td>Database options</td>
            <td>ClickHouse + Postgres (required together)</td>
            <td>ClickHouse, Postgres, or MongoDB (pick one)</td>
          </tr>
          <tr>
            <td>Hosted pricing</td>
            <td>From $9/mo (10k events)</td>
            <td>Self-host only (free, MIT)</td>
          </tr>
        </tbody>
      </table>

      <h2>When Plausible is the right pick</h2>
      <p>
        If the goal is to replace Google Analytics for your own marketing
        site, blog, or docs, Plausible is excellent. The hosted product is
        polished, the cookieless story is mature, and the dashboard looks
        great out of the box. You do not need to build anything; you embed
        a script and read the dashboard.
      </p>

      <h2>When Litemetrics is the right pick</h2>
      <p>
        Litemetrics shines when analytics is part of <em>your</em> product,
        not just a tool you use internally. Specific signals:
      </p>
      <ul>
        <li>
          You build a SaaS where customers want to see analytics on their
          own data (an e-commerce builder, a link-in-bio tool, a CMS, a
          form builder).
        </li>
        <li>
          You want a dashboard that looks like part of your app, not a
          third-party iframe.
        </li>
        <li>
          You need multi-tenant isolation by default, with per-customer{' '}
          <code>siteId</code> rather than one site per Plausible account.
        </li>
        <li>
          You want to ship analytics under your brand without building
          charts and tables yourself.
        </li>
      </ul>

      <h2>Migration notes</h2>
      <p>
        If you have been using Plausible to track your own product
        marketing, keep it; Litemetrics does not displace it. Most teams
        run both: Plausible for the marketing site, Litemetrics inside the
        product where the customer-facing dashboard lives.
      </p>

      <p>
        Try the live{' '}
        <a href="https://demo.litemetrics.dev" target="_blank" rel="noopener noreferrer">
          dashboard demo
        </a>
        , or jump to the{' '}
        <Link to="/docs/quickstart">Quickstart</Link> to spin up a local
        instance.
      </p>
    </MarketingLayout>
  );
}
