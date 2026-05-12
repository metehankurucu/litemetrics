import { Link } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import {
  SEO,
  articleSchema,
  breadcrumbSchema,
  organizationSchema,
} from './SEO';

interface DocLayoutProps {
  title: string;
  description: string;
  path: string;
  breadcrumbs: { name: string; url: string }[];
  children: React.ReactNode;
}

const docNav = [
  { path: '/docs/quickstart', label: 'Quickstart' },
  { path: '/docs/react', label: 'React' },
  { path: '/docs/clickhouse-setup', label: 'ClickHouse' },
  { path: '/docs/postgres-setup', label: 'Postgres' },
];

export function DocLayout({
  title,
  description,
  path,
  breadcrumbs,
  children,
}: DocLayoutProps) {
  return (
    <div className="min-h-screen bg-zinc-950 font-body">
      <SEO
        title={title}
        description={description}
        path={path}
        ogType="article"
        jsonLd={[
          organizationSchema(),
          articleSchema({ headline: title, description, path }),
          breadcrumbSchema(breadcrumbs),
        ]}
      />
      <Navbar />
      <main className="pt-24 pb-24">
        <div className="mx-auto max-w-6xl px-6">
          <nav className="text-sm text-zinc-500 mb-8" aria-label="Breadcrumb">
            <ol className="flex items-center gap-2 flex-wrap">
              {breadcrumbs.map((b, i) => {
                const isLast = i === breadcrumbs.length - 1;
                return (
                  <li key={b.url} className="flex items-center gap-2">
                    {isLast ? (
                      <span className="text-zinc-300">{b.name}</span>
                    ) : (
                      <Link to={b.url} className="hover:text-zinc-300 transition-colors">
                        {b.name}
                      </Link>
                    )}
                    {!isLast && <span className="text-zinc-700">/</span>}
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-12">
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
                Documentation
              </p>
              <ul className="space-y-1">
                {docNav.map((item) => {
                  const isActive = item.path === path;
                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive
                            ? 'bg-brand-500/10 text-brand-300 font-medium'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <article className="prose-doc max-w-none">{children}</article>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
