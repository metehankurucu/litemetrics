import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLitemetrics } from '@litemetrics/react';

export function Navbar() {
  const { track } = useLitemetrics();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Litemetrics" className="h-8 w-8 rounded-lg" />
          <span className="font-display text-xl text-white tracking-tight">Litemetrics</span>
        </Link>

        <div className="hidden md:flex items-center gap-7">
          <Link to="/docs/quickstart" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Docs
          </Link>
          <div
            className="relative"
            onMouseEnter={() => setCompareOpen(true)}
            onMouseLeave={() => setCompareOpen(false)}
          >
            <button
              className="text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
              aria-haspopup="true"
              aria-expanded={compareOpen}
            >
              Compare
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {compareOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-3">
                <div className="min-w-[180px] rounded-xl border border-zinc-800 bg-zinc-900/95 backdrop-blur-xl p-2 shadow-xl">
                  <Link to="/vs/plausible" className="block px-3 py-2 rounded-lg text-sm text-zinc-300 hover:bg-white/5 hover:text-white">
                    vs Plausible
                  </Link>
                  <Link to="/vs/umami" className="block px-3 py-2 rounded-lg text-sm text-zinc-300 hover:bg-white/5 hover:text-white">
                    vs Umami
                  </Link>
                  <Link to="/vs/posthog" className="block px-3 py-2 rounded-lg text-sm text-zinc-300 hover:bg-white/5 hover:text-white">
                    vs PostHog
                  </Link>
                </div>
              </div>
            )}
          </div>
          <Link to="/for/saas" className="text-sm text-zinc-400 hover:text-white transition-colors">
            For SaaS
          </Link>
          <a
            href="https://github.com/metehankurucu/litemetrics"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://demo.litemetrics.dev"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('Live Demo Click', { source: 'navbar' })}
            className="text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Live Demo
          </a>
          <Link
            to="/docs/quickstart"
            className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 px-4 py-2 rounded-lg transition-colors"
          >
            Get Started
          </Link>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 text-zinc-400 hover:text-white"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
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
        <div className="md:hidden border-t border-white/5 bg-zinc-950/95 backdrop-blur-xl px-6 py-4 space-y-2">
          <Link to="/docs/quickstart" onClick={() => setMobileOpen(false)} className="block text-sm text-zinc-400 hover:text-white py-1">
            Docs
          </Link>
          <Link to="/vs/plausible" onClick={() => setMobileOpen(false)} className="block text-sm text-zinc-400 hover:text-white py-1">
            vs Plausible
          </Link>
          <Link to="/vs/umami" onClick={() => setMobileOpen(false)} className="block text-sm text-zinc-400 hover:text-white py-1">
            vs Umami
          </Link>
          <Link to="/vs/posthog" onClick={() => setMobileOpen(false)} className="block text-sm text-zinc-400 hover:text-white py-1">
            vs PostHog
          </Link>
          <Link to="/for/saas" onClick={() => setMobileOpen(false)} className="block text-sm text-zinc-400 hover:text-white py-1">
            For SaaS
          </Link>
          <a href="https://github.com/metehankurucu/litemetrics" target="_blank" rel="noopener noreferrer" className="block text-sm text-zinc-400 hover:text-white py-1">
            GitHub
          </a>
          <a
            href="https://demo.litemetrics.dev"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('Live Demo Click', { source: 'navbar' })}
            className="block text-sm font-medium text-emerald-400 hover:text-emerald-300 py-1"
          >
            Live Demo
          </a>
          <Link
            to="/docs/quickstart"
            onClick={() => setMobileOpen(false)}
            className="block text-sm font-medium text-white bg-brand-600 px-4 py-2 rounded-lg text-center mt-2"
          >
            Get Started
          </Link>
        </div>
      )}
    </nav>
  );
}
