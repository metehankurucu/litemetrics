const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    title: 'Privacy First',
    description: 'No cookies. Respects Do Not Track. All data stays on your server. GDPR-compliant by design.',
    color: 'from-emerald-500/20 to-emerald-500/0',
    border: 'group-hover:border-emerald-500/20',
    iconColor: 'text-emerald-400',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: 'Lightweight',
    description: '3.5KB gzipped. Zero performance impact. Loads async, batches events, never blocks your UI.',
    color: 'from-amber-500/20 to-amber-500/0',
    border: 'group-hover:border-amber-500/20',
    iconColor: 'text-amber-400',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
      </svg>
    ),
    title: 'Auto-Tracking',
    description: 'Pageviews, SPA navigation, outbound links, file downloads, scroll depth, and rage clicks — all automatic.',
    color: 'from-blue-500/20 to-blue-500/0',
    border: 'group-hover:border-blue-500/20',
    iconColor: 'text-blue-400',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm10 0a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" />
      </svg>
    ),
    title: 'Multi-Platform',
    description: 'First-class SDKs for HTML, React, Next.js, React Native, and Node.js. One API everywhere.',
    color: 'from-violet-500/20 to-violet-500/0',
    border: 'group-hover:border-violet-500/20',
    iconColor: 'text-violet-400',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'Real-Time Dashboard',
    description: 'Live visitors, world map, interactive charts, event explorer, user profiles — all built-in.',
    color: 'from-rose-500/20 to-rose-500/0',
    border: 'group-hover:border-rose-500/20',
    iconColor: 'text-rose-400',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
      </svg>
    ),
    title: 'Self-Hosted',
    description: 'ClickHouse or MongoDB. Deploy on your infra. One command setup. No vendor lock-in.',
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
            Built for developers who care about performance and privacy.
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
