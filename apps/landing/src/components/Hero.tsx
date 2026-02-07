export function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden pt-16">
      {/* Background effects */}
      <div className="absolute inset-0 bg-grid" />
      <div className="glow-orb w-[600px] h-[600px] bg-brand-600/20 top-[-200px] left-1/2 -translate-x-1/2 animate-glow" />
      <div className="glow-orb w-[400px] h-[400px] bg-purple-600/15 bottom-[-100px] right-[-100px]" />
      <div className="glow-orb w-[300px] h-[300px] bg-brand-400/10 top-[30%] left-[-100px]" />

      <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand-500/20 bg-brand-500/5 mb-8 animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm text-brand-300 font-medium">Open Source &middot; MIT License</span>
        </div>

        {/* Headline */}
        <h1
          className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl tracking-tight leading-[0.95] mb-6 animate-fade-up"
          style={{ animationDelay: '0.1s', opacity: 0 }}
        >
          Analytics that
          <br />
          <span className="text-gradient">respect your users</span>
        </h1>

        {/* Subtitle */}
        <p
          className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-up"
          style={{ animationDelay: '0.25s', opacity: 0 }}
        >
          Open-source, self-hosted web analytics SDK.
          Drop-in tracker under <span className="text-white font-medium">3.5KB</span>.
          No cookies, no third parties, full control.
        </p>

        {/* CTAs */}
        <div
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-fade-up"
          style={{ animationDelay: '0.4s', opacity: 0 }}
        >
          <a
            href="#get-started"
            className="group relative px-8 py-3.5 rounded-xl bg-brand-600 text-white font-medium text-base hover:bg-brand-500 transition-all hover:shadow-lg hover:shadow-brand-500/25"
          >
            Get Started
            <svg className="inline-block w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
          <a
            href="https://github.com/metehankurucu/litemetrics"
            target="_blank"
            rel="noopener"
            className="px-8 py-3.5 rounded-xl border border-zinc-700 text-zinc-300 font-medium text-base hover:border-zinc-500 hover:text-white transition-all hover:bg-white/5"
          >
            <svg className="inline-block w-5 h-5 mr-2 -mt-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            View on GitHub
          </a>
        </div>

        {/* Terminal-style install command */}
        <div
          className="inline-flex items-center gap-3 bg-zinc-900/80 border border-zinc-800 rounded-xl px-5 py-3 animate-fade-up"
          style={{ animationDelay: '0.55s', opacity: 0 }}
        >
          <span className="text-brand-400 text-sm font-mono">$</span>
          <code className="text-zinc-300 text-sm font-mono">npm install @litemetrics/tracker</code>
          <button
            onClick={() => navigator.clipboard.writeText('npm install @litemetrics/tracker')}
            className="text-zinc-500 hover:text-zinc-300 transition-colors ml-1"
            title="Copy"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-zinc-950 to-transparent" />
    </section>
  );
}
