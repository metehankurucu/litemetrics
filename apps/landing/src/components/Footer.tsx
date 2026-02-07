export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-zinc-950">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Litemetrics" className="h-7 w-7 rounded-lg" />
            <span className="font-display text-lg text-white tracking-tight">Litemetrics</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-8">
            <a href="https://github.com/metehankurucu/litemetrics#readme" target="_blank" rel="noopener" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Docs</a>
            <a href="https://github.com/metehankurucu/litemetrics" target="_blank" rel="noopener" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">GitHub</a>
            <a href="https://www.npmjs.com/org/litemetrics" target="_blank" rel="noopener" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">npm</a>
            <a href="#features" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Features</a>
          </div>

          {/* License */}
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-zinc-800 text-xs text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              MIT License
            </span>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-zinc-800/50 text-center">
          <p className="text-xs text-zinc-600">
            Made with care for the open web.
          </p>
        </div>
      </div>
    </footer>
  );
}
