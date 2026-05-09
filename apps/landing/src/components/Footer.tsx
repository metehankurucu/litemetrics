import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-zinc-950">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-10 mb-12">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2.5 mb-3">
              <img src="/logo.png" alt="Litemetrics" className="h-7 w-7 rounded-lg" />
              <span className="font-display text-lg text-white tracking-tight">
                Litemetrics
              </span>
            </div>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Embedded analytics for SaaS products. Open source, MIT licensed.
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-4">
              Documentation
            </p>
            <ul className="space-y-2">
              <li>
                <Link to="/docs/quickstart" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  Quickstart
                </Link>
              </li>
              <li>
                <Link to="/docs/react" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  React
                </Link>
              </li>
              <li>
                <Link to="/docs/clickhouse-setup" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  ClickHouse setup
                </Link>
              </li>
              <li>
                <Link to="/docs/postgres-setup" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  Postgres setup
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-4">
              Compare
            </p>
            <ul className="space-y-2">
              <li>
                <Link to="/vs/plausible" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  vs Plausible
                </Link>
              </li>
              <li>
                <Link to="/vs/umami" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  vs Umami
                </Link>
              </li>
              <li>
                <Link to="/vs/posthog" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  vs PostHog
                </Link>
              </li>
              <li>
                <Link to="/for/saas" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  For SaaS
                </Link>
              </li>
              <li>
                <Link to="/for/embedded-analytics" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  For embedded analytics
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-4">
              Resources
            </p>
            <ul className="space-y-2">
              <li>
                <a href="https://github.com/metehankurucu/litemetrics" target="_blank" rel="noopener noreferrer" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  GitHub
                </a>
              </li>
              <li>
                <a href="https://www.npmjs.com/org/litemetrics" target="_blank" rel="noopener noreferrer" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  npm
                </a>
              </li>
              <li>
                <a href="https://demo.litemetrics.dev" target="_blank" rel="noopener noreferrer" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  Live demo
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-zinc-800/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-zinc-600">
            Made with care for the open web.
          </p>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-zinc-800 text-xs text-zinc-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            MIT License
          </span>
        </div>
      </div>
    </footer>
  );
}
