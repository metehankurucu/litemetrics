import { Link } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import {
  SEO,
  articleSchema,
  breadcrumbSchema,
  organizationSchema,
} from './SEO';

interface MarketingLayoutProps {
  title: string;
  description: string;
  path: string;
  breadcrumbs: { name: string; url: string }[];
  children: React.ReactNode;
}

export function MarketingLayout({
  title,
  description,
  path,
  breadcrumbs,
  children,
}: MarketingLayoutProps) {
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
        <div className="mx-auto max-w-4xl px-6">
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

          <article className="prose-doc max-w-none">{children}</article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
