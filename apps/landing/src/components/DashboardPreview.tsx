export function DashboardPreview() {
  return (
    <section className="relative py-24 md:py-32 overflow-hidden">
      <div className="glow-orb w-[500px] h-[500px] bg-brand-600/15 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="text-center mb-12">
          <p className="text-sm font-medium text-brand-400 uppercase tracking-wider mb-3">Dashboard</p>
          <h2 className="font-display text-4xl sm:text-5xl text-white tracking-tight mb-4">
            This is what your<br />users get
          </h2>
          <p className="text-lg text-zinc-400 max-w-xl mx-auto">
            Embed this dashboard in your product. Fully themeable, dark mode included. No iframe — native React components.
          </p>
        </div>

        {/* Mock dashboard */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden shadow-2xl shadow-black/40">
          {/* Window chrome */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-zinc-700" />
              <span className="w-3 h-3 rounded-full bg-zinc-700" />
              <span className="w-3 h-3 rounded-full bg-zinc-700" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="bg-zinc-800 rounded-md px-4 py-1 text-xs text-zinc-500 font-mono">
                your-app.com/analytics
              </div>
            </div>
          </div>

          {/* Dashboard content */}
          <div className="p-6">
            {/* Stat cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Pageviews', value: '24,831', change: '+12.5%', up: true },
                { label: 'Visitors', value: '8,492', change: '+8.2%', up: true },
                { label: 'Sessions', value: '11,247', change: '+5.1%', up: true },
                { label: 'Events', value: '3,104', change: '+22.8%', up: true },
              ].map((stat, i) => (
                <div key={i} className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{stat.label}</p>
                  <p className="text-xl font-semibold text-white tabular-nums">{stat.value}</p>
                  <p className={`text-xs mt-1 ${stat.up ? 'text-emerald-400' : 'text-red-400'}`}>
                    {stat.change}
                  </p>
                </div>
              ))}
            </div>

            {/* Chart area */}
            <div className="bg-zinc-800/30 border border-zinc-700/30 rounded-xl p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wide">Visitors — Last 30 Days</p>
                <div className="flex gap-1">
                  <span className="px-2 py-0.5 text-xs rounded bg-brand-600 text-white">30D</span>
                  <span className="px-2 py-0.5 text-xs rounded text-zinc-500">7D</span>
                  <span className="px-2 py-0.5 text-xs rounded text-zinc-500">24H</span>
                </div>
              </div>
              {/* Fake chart bars */}
              <div className="flex items-end gap-1 h-32">
                {[40, 55, 45, 60, 50, 75, 65, 80, 70, 85, 90, 78, 65, 88, 95, 82, 70, 92, 88, 76, 85, 90, 95, 88, 82, 90, 95, 100, 92, 85].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t bg-gradient-to-t from-brand-600/80 to-brand-400/80 transition-all hover:from-brand-500 hover:to-brand-300"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            {/* Bottom panels */}
            <div className="grid grid-cols-3 gap-4">
              {/* Top pages */}
              <div className="bg-zinc-800/30 border border-zinc-700/30 rounded-xl p-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Top Pages</p>
                {[
                  { page: '/pricing', val: '3,241' },
                  { page: '/docs/getting-started', val: '2,187' },
                  { page: '/blog/privacy', val: '1,842' },
                  { page: '/features', val: '1,523' },
                ].map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-zinc-300 truncate">{r.page}</span>
                    <span className="text-xs text-zinc-500 tabular-nums ml-2">{r.val}</span>
                  </div>
                ))}
              </div>

              {/* Top countries */}
              <div className="bg-zinc-800/30 border border-zinc-700/30 rounded-xl p-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Countries</p>
                {[
                  { flag: '🇺🇸', name: 'United States', val: '4,821' },
                  { flag: '🇩🇪', name: 'Germany', val: '2,103' },
                  { flag: '🇬🇧', name: 'United Kingdom', val: '1,847' },
                  { flag: '🇹🇷', name: 'Turkey', val: '1,204' },
                ].map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-zinc-300"><span className="mr-2">{r.flag}</span>{r.name}</span>
                    <span className="text-xs text-zinc-500 tabular-nums ml-2">{r.val}</span>
                  </div>
                ))}
              </div>

              {/* Top browsers */}
              <div className="bg-zinc-800/30 border border-zinc-700/30 rounded-xl p-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Browsers</p>
                {[
                  { name: 'Chrome', val: '58%', bar: 58 },
                  { name: 'Safari', val: '22%', bar: 22 },
                  { name: 'Firefox', val: '12%', bar: 12 },
                  { name: 'Edge', val: '6%', bar: 6 },
                ].map((r, i) => (
                  <div key={i} className="py-1.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-zinc-300">{r.name}</span>
                      <span className="text-xs text-zinc-500">{r.val}</span>
                    </div>
                    <div className="h-1 bg-zinc-700/50 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500/60 rounded-full" style={{ width: `${r.bar}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
