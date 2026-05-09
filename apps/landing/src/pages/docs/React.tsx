import { Link } from 'react-router-dom';
import { DocLayout } from '../../components/DocLayout';

export default function ReactDoc() {
  return (
    <DocLayout
      title="Litemetrics for React - Provider, hooks, and Next.js"
      description="Add analytics to your React or Next.js app with @litemetrics/react. Provider, useTrackEvent, usePageView, and useLitemetrics hooks, plus App Router patterns."
      path="/docs/react"
      breadcrumbs={[
        { name: 'Home', url: '/' },
        { name: 'Docs', url: '/docs/quickstart' },
        { name: 'React', url: '/docs/react' },
      ]}
    >
      <h1>React integration</h1>
      <p className="lead">
        <code>@litemetrics/react</code> wraps the browser tracker in a
        Provider and three hooks. It works in any React 17+ app, including
        Next.js (Pages Router and App Router), Vite, Remix, and React Native
        web.
      </p>

      <h2>Install</h2>
      <pre>
        <code>{`npm install @litemetrics/react`}</code>
      </pre>

      <h2>Wrap your app with the Provider</h2>
      <p>
        Mount the Provider once at the top of your tree. It boots the tracker
        and exposes it via context.
      </p>
      <pre>
        <code>{`import { LitemetricsProvider } from '@litemetrics/react';

function App() {
  return (
    <LitemetricsProvider
      siteId="your-site-id"
      endpoint="https://your-server.com/api/collect"
    >
      <YourApp />
    </LitemetricsProvider>
  );
}`}</code>
      </pre>
      <p>
        SPA route changes are auto-tracked. You do not need to call{' '}
        <code>page()</code> manually unless you want to (see{' '}
        <code>usePageView</code> below).
      </p>

      <h2>Hooks</h2>

      <h3>useTrackEvent</h3>
      <p>Track named events with optional metadata:</p>
      <pre>
        <code>{`import { useTrackEvent } from '@litemetrics/react';

function SignupButton() {
  const track = useTrackEvent();
  return (
    <button onClick={() => track('Signup', { plan: 'pro' })}>
      Sign Up
    </button>
  );
}`}</code>
      </pre>

      <h3>usePageView</h3>
      <p>
        Manually fire a pageview on mount. Useful inside virtualized routes,
        modals you treat as pages, or stepper screens.
      </p>
      <pre>
        <code>{`import { usePageView } from '@litemetrics/react';

function CheckoutStep({ step }) {
  usePageView({ path: \`/checkout/step-\${step}\` });
  return <div>...</div>;
}`}</code>
      </pre>

      <h3>useLitemetrics</h3>
      <p>
        Access the underlying tracker for advanced calls like{' '}
        <code>identify()</code>, <code>page()</code> with overrides, or
        reading the current visitor id.
      </p>
      <pre>
        <code>{`import { useLitemetrics } from '@litemetrics/react';

function UserProfile({ user }) {
  const tracker = useLitemetrics();

  useEffect(() => {
    tracker.identify(user.id, { name: user.name, plan: user.plan });
  }, [user]);

  return <div>...</div>;
}`}</code>
      </pre>

      <h2>Next.js App Router</h2>
      <p>
        The Provider needs to run on the client, so wrap it in a{' '}
        <code>'use client'</code> boundary, then mount it in your root layout.
      </p>
      <pre>
        <code>{`// app/providers.tsx
'use client';
import { LitemetricsProvider } from '@litemetrics/react';

export function Providers({ children }) {
  return (
    <LitemetricsProvider
      siteId={process.env.NEXT_PUBLIC_LITEMETRICS_SITE_ID}
      endpoint={process.env.NEXT_PUBLIC_LITEMETRICS_ENDPOINT}
    >
      {children}
    </LitemetricsProvider>
  );
}

// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}`}</code>
      </pre>
      <p>
        App Router navigations fire <code>history.pushState</code>, which the
        tracker auto-detects. No router-specific glue is required.
      </p>

      <h2>Embedding the dashboard</h2>
      <p>
        For the white-label dashboard component, install{' '}
        <code>@litemetrics/ui</code> and pair it with your customers'{' '}
        <code>siteId</code>:
      </p>
      <pre>
        <code>{`import {
  LitemetricsProvider,
  AnalyticsDashboard,
} from '@litemetrics/ui';

function CustomerAnalytics({ customerId }) {
  return (
    <LitemetricsProvider
      baseUrl="/api"
      siteId={customerId}
      secretKey={getSecretFor(customerId)}
    >
      <AnalyticsDashboard theme="midnight" />
    </LitemetricsProvider>
  );
}`}</code>
      </pre>
      <p>
        See the <Link to="/for/embedded-analytics">embedded analytics use
        case</Link> for the multi-tenant pattern in detail, or jump straight
        to the <Link to="/docs/quickstart">Quickstart</Link> if you have not
        set up a server yet.
      </p>
    </DocLayout>
  );
}
