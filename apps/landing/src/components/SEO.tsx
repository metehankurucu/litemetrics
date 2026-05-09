interface SEOProps {
  title: string;
  description: string;
  path: string;
  jsonLd?: object | object[];
  ogImage?: string;
  ogType?: 'website' | 'article';
}

const SITE = 'https://litemetrics.dev';

// Match Netlify's default trailing-slash redirect so canonical URLs
// align with the URL the user actually lands on.
function withTrailingSlash(path: string): string {
  if (path === '/' || path.endsWith('/')) return path;
  return `${path}/`;
}

export function SEO({
  title,
  description,
  path,
  jsonLd,
  ogImage,
  ogType = 'website',
}: SEOProps) {
  const url = `${SITE}${withTrailingSlash(path)}`;
  const image = ogImage ?? `${SITE}/og-image.png`;
  const ldArray = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content="Litemetrics" />
      <meta property="og:locale" content="en_US" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      {ldArray.map((ld, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
        />
      ))}
    </>
  );
}

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Litemetrics',
    url: SITE,
    logo: `${SITE}/logo.png`,
    sameAs: [
      'https://github.com/metehankurucu/litemetrics',
      'https://www.npmjs.com/org/litemetrics',
    ],
  };
}

export function softwareApplicationSchema(description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Litemetrics',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any',
    description,
    url: SITE,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    license: 'https://opensource.org/licenses/MIT',
    codeRepository: 'https://github.com/metehankurucu/litemetrics',
  };
}

export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE}${withTrailingSlash(item.url)}`,
    })),
  };
}

export function articleSchema(opts: {
  headline: string;
  description: string;
  path: string;
  datePublished?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.headline,
    description: opts.description,
    author: { '@type': 'Organization', name: 'Litemetrics' },
    publisher: organizationSchema(),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${SITE}${withTrailingSlash(opts.path)}`,
    },
    datePublished: opts.datePublished ?? '2026-05-09',
    dateModified: '2026-05-09',
  };
}

export function faqSchema(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}
