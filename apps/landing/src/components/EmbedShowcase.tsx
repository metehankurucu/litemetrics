const steps = [
  {
    number: '1',
    title: 'Install',
    code: 'npm install @litemetrics/ui',
    description: 'Add the UI package to your project',
  },
  {
    number: '2',
    title: 'Wrap',
    code: '<LitemetricsProvider baseUrl="/api/stats" siteId={customerId}>',
    description: 'Connect to your Litemetrics server',
  },
  {
    number: '3',
    title: 'Render',
    code: '<AnalyticsDashboard theme="midnight" />',
    description: 'Your customers now have analytics',
  },
];

export function EmbedShowcase() {
  return (
    <section className="relative py-24 md:py-32">
      <div className="absolute inset-0 bg-dots opacity-30" />
      <div className="relative z-10 mx-auto max-w-5xl px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-brand-400 uppercase tracking-wider mb-3">How it works</p>
          <h2 className="font-display text-4xl sm:text-5xl text-white tracking-tight mb-4">
            Integrate analytics in<br />three steps
          </h2>
          <p className="text-lg text-zinc-400 max-w-xl mx-auto">
            Give your customers a full analytics dashboard. No building from scratch.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <div key={i} className="relative group">
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-10 left-full w-6 h-px bg-zinc-700 z-20" />
              )}

              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-7 h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20 hover:border-brand-500/20">
                {/* Step number */}
                <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/20 flex items-center justify-center mb-5">
                  <span className="text-brand-400 font-display text-lg">{step.number}</span>
                </div>

                <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-zinc-400 mb-4">{step.description}</p>

                {/* Code snippet */}
                <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg px-4 py-3">
                  <code className="text-xs font-mono text-brand-300 break-all">{step.code}</code>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <p className="text-zinc-500 text-sm">
            That's it. Your customers now have a full analytics dashboard with charts, maps, and tables.
          </p>
        </div>
      </div>
    </section>
  );
}
