const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm10 0a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" />
      </svg>
    ),
    title: 'Embeddable Dashboard',
    description: 'Drop a full analytics dashboard into your React app. Charts, maps, tables — all pre-built. Your customers get analytics without you building anything.',
    color: 'from-brand-500/20 to-brand-500/0',
    border: 'group-hover:border-brand-500/20',
    iconColor: 'text-brand-400',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
    title: 'White-Label Theming',
    description: '10 built-in presets. CSS custom properties for full control. Your brand colors, your dashboard. Dark mode included.',
    color: 'from-violet-500/20 to-violet-500/0',
    border: 'group-hover:border-violet-500/20',
    iconColor: 'text-violet-400',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    title: 'Multi-Tenant',
    description: 'Each customer gets their own isolated analytics. One database, zero cross-contamination. Built-in site_id isolation.',
    color: 'from-emerald-500/20 to-emerald-500/0',
    border: 'group-hover:border-emerald-500/20',
    iconColor: 'text-emerald-400',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    title: 'Multi-Platform',
    description: 'First-class SDKs for React, React Native, Next.js, Vue, and plain HTML. One API everywhere.',
    color: 'from-blue-500/20 to-blue-500/0',
    border: 'group-hover:border-blue-500/20',
    iconColor: 'text-blue-400',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: 'Lightweight',
    description: '3.5KB gzipped tracker. Zero performance impact. Loads async, batches events, never blocks your UI.',
    color: 'from-amber-500/20 to-amber-500/0',
    border: 'group-hover:border-amber-500/20',
    iconColor: 'text-amber-400',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
      </svg>
    ),
    title: 'Self-Hosted',
    description: 'ClickHouse or MongoDB. Deploy on your infra. No cookies, no third parties, GDPR-compliant by design.',
    color: 'from-cyan-500/20 to-cyan-500/0',
    border: 'group-hover:border-cyan-500/20',
    iconColor: 'text-cyan-400',
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-24 md:py-32">
      <div className="absolute inset-0 bg-dots opacity-50" />
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-brand-400 uppercase tracking-wider mb-3">Features</p>
          <h2 className="font-display text-4xl sm:text-5xl text-white tracking-tight mb-4">
            Everything you need,<br />nothing you don't
          </h2>
          <p className="text-lg text-zinc-400 max-w-xl mx-auto">
            Built for developers who ship analytics to their customers.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature, i) => (
            <div
              key={i}
              className={`group relative rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20 ${feature.border}`}
            >
              <div className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${feature.color} opacity-0 group-hover:opacity-100 transition-opacity`} />
              <div className="relative">
                <div className={`w-11 h-11 rounded-xl bg-zinc-800/80 flex items-center justify-center mb-5 ${feature.iconColor}`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
