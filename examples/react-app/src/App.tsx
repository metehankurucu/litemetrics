import { useState, useEffect } from 'react';
import { useInsayt, usePageView, useTrackEvent } from '@insayt/react';
import { createClient, type QueryResult } from '@insayt/client';

const INSAYT_URL = import.meta.env.VITE_INSAYT_URL || 'http://localhost:3002';
const SITE_ID = import.meta.env.VITE_INSAYT_SITE_ID || 'demo';
const SECRET_KEY = import.meta.env.VITE_INSAYT_SECRET_KEY || '';

const client = createClient({
  baseUrl: INSAYT_URL,
  siteId: SITE_ID,
  secretKey: SECRET_KEY || undefined,
});

type Page = 'home' | 'about' | 'pricing';

export function App() {
  const [page, setPage] = useState<Page>('home');

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Insayt React Example</h1>
      <p style={{ color: '#71717a', marginBottom: 24, fontSize: 14 }}>
        siteId: <code style={{ background: '#27272a', padding: '2px 6px', borderRadius: 4 }}>{SITE_ID}</code>
      </p>

      {/* Navigation */}
      <nav style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        {(['home', 'about', 'pricing'] as Page[]).map((p) => (
          <button
            key={p}
            onClick={() => setPage(p)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: page === p ? '1px solid #6366f1' : '1px solid #3f3f46',
              background: page === p ? '#6366f1' : '#18181b',
              color: page === p ? '#fff' : '#a1a1aa',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </nav>

      {/* Page content */}
      {page === 'home' && <HomePage />}
      {page === 'about' && <AboutPage />}
      {page === 'pricing' && <PricingPage />}

      {/* Stats viewer */}
      <StatsViewer />
    </div>
  );
}

function HomePage() {
  usePageView('/home');
  const { track } = useInsayt();

  return (
    <Section title="Home">
      <p style={{ color: '#a1a1aa', marginBottom: 16 }}>Welcome! Click the buttons to generate events.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <ActionButton label="Sign Up" onClick={() => track('signup', { plan: 'free' })} />
        <ActionButton label="Subscribe" onClick={() => track('subscribe', { plan: 'pro' })} />
        <ActionButton label="Add to Cart" onClick={() => track('add_to_cart', { item: 'widget', price: 9.99 })} />
      </div>
    </Section>
  );
}

function AboutPage() {
  usePageView('/about');
  useTrackEvent('page_section_viewed', { section: 'about' });

  return (
    <Section title="About">
      <p style={{ color: '#a1a1aa' }}>This page auto-tracks a pageview + a custom event on mount.</p>
    </Section>
  );
}

function PricingPage() {
  usePageView('/pricing');
  const { track, identify } = useInsayt();

  return (
    <Section title="Pricing">
      <p style={{ color: '#a1a1aa', marginBottom: 16 }}>Test identify and custom events.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <ActionButton
          label="Identify as user_123"
          onClick={() => identify('user_123', { name: 'Test User', plan: 'pro' })}
        />
        <ActionButton
          label="Track Purchase"
          onClick={() => track('purchase', { amount: 49, currency: 'USD' })}
        />
      </div>
    </Section>
  );
}

function StatsViewer() {
  const [stats, setStats] = useState<Record<string, QueryResult>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pageviews, visitors, sessions, events, topPages, topEvents] = await Promise.all([
        client.getPageviews({ period: '24h' }),
        client.getVisitors({ period: '24h' }),
        client.getSessions({ period: '24h' }),
        client.getEvents({ period: '24h' }),
        client.getTopPages({ period: '24h', limit: 5 }),
        client.getTopEvents({ period: '24h', limit: 5 }),
      ]);
      setStats({ pageviews, visitors, sessions, events, topPages, topEvents });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  return (
    <div style={{ marginTop: 32, padding: 20, background: '#18181b', borderRadius: 12, border: '1px solid #27272a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16 }}>Live Stats (24h)</h2>
        <button
          onClick={fetchStats}
          style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #3f3f46', background: '#27272a', color: '#a1a1aa', cursor: 'pointer', fontSize: 13 }}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}

      {/* Counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {['pageviews', 'visitors', 'sessions', 'events'].map((m) => (
          <div key={m} style={{ padding: 12, background: '#0a0a0a', borderRadius: 8, border: '1px solid #27272a' }}>
            <p style={{ fontSize: 11, color: '#71717a', textTransform: 'capitalize' }}>{m}</p>
            <p style={{ fontSize: 24, fontWeight: 600 }}>{stats[m]?.total ?? '-'}</p>
          </div>
        ))}
      </div>

      {/* Top lists */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <TopListMini title="Top Pages" data={stats.topPages?.data ?? []} />
        <TopListMini title="Top Events" data={stats.topEvents?.data ?? []} />
      </div>
    </div>
  );
}

function TopListMini({ title, data }: { title: string; data: { key: string; value: number }[] }) {
  return (
    <div style={{ padding: 12, background: '#0a0a0a', borderRadius: 8, border: '1px solid #27272a' }}>
      <p style={{ fontSize: 12, color: '#71717a', marginBottom: 8 }}>{title}</p>
      {data.length === 0 ? (
        <p style={{ fontSize: 12, color: '#52525b' }}>No data</p>
      ) : (
        data.map((d) => (
          <div key={d.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
            <span style={{ color: '#d4d4d8' }}>{d.key}</span>
            <span style={{ color: '#71717a' }}>{d.value}</span>
          </div>
        ))
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 20, background: '#18181b', borderRadius: 12, border: '1px solid #27272a', marginBottom: 16 }}>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>{title}</h2>
      {children}
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px',
        borderRadius: 8,
        border: '1px solid #3f3f46',
        background: '#27272a',
        color: '#e4e4e7',
        cursor: 'pointer',
        fontSize: 13,
      }}
    >
      {label}
    </button>
  );
}
