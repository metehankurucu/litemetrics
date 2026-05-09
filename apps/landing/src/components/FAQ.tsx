import { useState } from 'react';

export interface FAQItem {
  question: string;
  answer: string;
}

export const homeFaqItems: FAQItem[] = [
  {
    question: 'What is Litemetrics?',
    answer:
      'Litemetrics is an open-source analytics SDK and dashboard you embed inside your own SaaS product. Your customers get a full pre-built analytics view (charts, maps, top pages, sessions) without you having to design or build it. The whole stack (tracker, server, query API, and dashboard) is MIT licensed and self-hosted on your infrastructure.',
  },
  {
    question: 'How is this different from Plausible or Umami?',
    answer:
      'Plausible and Umami are first-party analytics tools you use to measure your own site. Litemetrics is built for embedding analytics into your product so each of your customers gets their own isolated dashboard. It includes a multi-tenant model (site_id isolation), white-label theming, and ready-made React dashboard components, none of which Plausible or Umami ship out of the box.',
  },
  {
    question: 'Can I embed analytics into my own SaaS for my customers?',
    answer:
      'Yes. That is the primary use case. Wrap the dashboard component with a customer-specific siteId and each tenant sees only their own data. Themes, colors, and copy are customizable via CSS variables, so the dashboard looks like a native part of your product.',
  },
  {
    question: 'Which databases are supported?',
    answer:
      'Litemetrics ships with three production-ready adapters: ClickHouse (recommended for scale and fast aggregations), Postgres (simplest self-host, ideal if you already run Postgres), and MongoDB. All three have full feature parity for pageviews, events, sessions, retention, top breakdowns, and geo.',
  },
  {
    question: 'Does it work without cookies?',
    answer:
      'Yes. Litemetrics uses a privacy-friendly hashed visitor identifier derived per day per site, with no cross-site tracking and no third-party cookies. This makes it GDPR-compliant by design and removes the need for a cookie banner in most jurisdictions.',
  },
  {
    question: 'What is the bundle size impact?',
    answer:
      'The browser tracker is under 3.5KB gzipped. It loads asynchronously, batches events, and never blocks your UI thread. The dashboard component is loaded only on the page where you render it, so it has zero cost on the rest of your app.',
  },
];

export function FAQ({ items = homeFaqItems }: { items?: FAQItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section id="faq" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center mb-12">
          <p className="text-sm font-medium text-brand-400 uppercase tracking-wider mb-3">
            FAQ
          </p>
          <h2 className="font-display text-4xl sm:text-5xl text-white tracking-tight mb-4">
            Frequently asked questions
          </h2>
          <p className="text-lg text-zinc-400">
            Everything you need to know before you embed Litemetrics.
          </p>
        </div>

        <div className="space-y-3">
          {items.map((item, i) => {
            const isOpen = openIdx === i;
            return (
              <div
                key={i}
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden transition-colors hover:border-zinc-700"
              >
                <button
                  onClick={() => setOpenIdx(isOpen ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-5 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-base sm:text-lg font-medium text-white pr-6">
                    {item.question}
                  </span>
                  <svg
                    className={`flex-shrink-0 w-5 h-5 text-zinc-500 transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 text-sm sm:text-base text-zinc-400 leading-relaxed">
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
