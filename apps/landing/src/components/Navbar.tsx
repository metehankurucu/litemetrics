import { useState } from 'react';

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Litemetrics" className="h-8 w-8 rounded-lg" />
          <span className="font-display text-xl text-white tracking-tight">Litemetrics</span>
        </a>

        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-zinc-400 hover:text-white transition-colors">Features</a>
          <a href="#setup" className="text-sm text-zinc-400 hover:text-white transition-colors">Setup</a>
          <a href="https://github.com/metehankurucu/litemetrics" target="_blank" rel="noopener" className="text-sm text-zinc-400 hover:text-white transition-colors">GitHub</a>
          <a href="https://github.com/metehankurucu/litemetrics#readme" target="_blank" rel="noopener" className="text-sm text-zinc-400 hover:text-white transition-colors">Docs</a>
          <a
            href="#get-started"
            className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 px-4 py-2 rounded-lg transition-colors"
          >
            Get Started
          </a>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 text-zinc-400 hover:text-white"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileOpen ? (
              <path strokeLinecap="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-white/5 bg-zinc-950/95 backdrop-blur-xl px-6 py-4 space-y-3">
          <a href="#features" className="block text-sm text-zinc-400 hover:text-white">Features</a>
          <a href="#setup" className="block text-sm text-zinc-400 hover:text-white">Setup</a>
          <a href="https://github.com/metehankurucu/litemetrics" target="_blank" rel="noopener" className="block text-sm text-zinc-400 hover:text-white">GitHub</a>
          <a href="https://github.com/metehankurucu/litemetrics#readme" target="_blank" rel="noopener" className="block text-sm text-zinc-400 hover:text-white">Docs</a>
          <a href="#get-started" className="block text-sm font-medium text-white bg-brand-600 px-4 py-2 rounded-lg text-center">
            Get Started
          </a>
        </div>
      )}
    </nav>
  );
}
