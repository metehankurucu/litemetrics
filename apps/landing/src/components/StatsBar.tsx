const stats = [
  { value: '5 Lines', label: 'To Embed' },
  { value: '10', label: 'Theme Presets' },
  { value: 'Multi', label: 'Tenant' },
  { value: '<3.5KB', label: 'Tracker' },
];

export function StatsBar() {
  return (
    <section className="relative border-y border-white/5 bg-zinc-900/50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <div key={i} className="text-center">
              <p className="font-display text-3xl sm:text-4xl text-white mb-1">{stat.value}</p>
              <p className="text-sm text-zinc-500 uppercase tracking-wider font-medium">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
