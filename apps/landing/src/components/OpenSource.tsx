export function OpenSource() {
  return (
    <section className="relative py-24 md:py-32">
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div className="glow-orb w-[500px] h-[500px] bg-brand-600/10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        {/* GitHub icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-800/80 border border-zinc-700/50 mb-8">
          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
        </div>

        <h2 className="font-display text-4xl sm:text-5xl text-white tracking-tight mb-4">
          Built in the open
        </h2>
        <p className="text-lg text-zinc-400 max-w-lg mx-auto mb-8 leading-relaxed">
          Litemetrics is open source and MIT licensed. Built for SaaS developers who want to offer analytics to their customers without building from scratch. Inspect every line, contribute, or fork it entirely.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="https://github.com/metehankurucu/litemetrics"
            target="_blank"
            rel="noopener"
            className="group px-8 py-3.5 rounded-xl bg-white text-zinc-900 font-medium text-base hover:bg-zinc-100 transition-all shadow-lg shadow-white/5"
          >
            <svg className="inline-block w-5 h-5 mr-2 -mt-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Star on GitHub
          </a>
          <a
            href="https://www.npmjs.com/org/litemetrics"
            target="_blank"
            rel="noopener"
            className="px-8 py-3.5 rounded-xl border border-zinc-700 text-zinc-300 font-medium text-base hover:border-zinc-500 hover:text-white transition-all hover:bg-white/5"
          >
            View on npm
          </a>
        </div>
      </div>
    </section>
  );
}
