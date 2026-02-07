import { useState, useCallback } from 'react';
import { LitemetricsProvider, AnalyticsDashboard } from '@litemetrics/ui';
import type { LitemetricsTheme } from '@litemetrics/ui';
import { ThemeEditor } from './ThemeEditor';

const BASE_URL = import.meta.env.VITE_LITEMETRICS_URL || 'http://localhost:3002';
const SITE_ID = import.meta.env.VITE_LITEMETRICS_SITE_ID || '';
const SECRET_KEY = import.meta.env.VITE_LITEMETRICS_SECRET_KEY || '';

export function App() {
  const [dark, setDark] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [theme, setTheme] = useState<Required<LitemetricsTheme> | undefined>(undefined);
  const [darkThemeOverride, setDarkThemeOverride] = useState<Required<LitemetricsTheme> | undefined>(undefined);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
  }

  const handleSelect = useCallback((name: string, light: Required<LitemetricsTheme>, darkT: Required<LitemetricsTheme>) => {
    setActivePreset(name);
    if (name === 'Default') {
      setTheme(undefined);
      setDarkThemeOverride(undefined);
    } else {
      setTheme(light);
      setDarkThemeOverride(darkT);
    }
  }, []);

  const handleReset = useCallback(() => {
    setActivePreset(null);
    setTheme(undefined);
    setDarkThemeOverride(undefined);
  }, []);

  return (
    <div className={`min-h-screen ${dark ? 'bg-zinc-950' : 'bg-zinc-50'} transition-colors`}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className={`text-2xl font-bold ${dark ? 'text-zinc-100' : 'text-zinc-900'}`}>Litemetrics UI Demo</h1>
            <p className={`text-sm mt-1 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Full analytics dashboard using <code className={`px-1.5 py-0.5 rounded text-xs ${dark ? 'bg-zinc-800' : 'bg-zinc-200'}`}>@litemetrics/ui</code>
            </p>
            <div className={`flex gap-4 mt-2 text-xs ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              <span>Server: <code className={dark ? 'text-zinc-300' : 'text-zinc-600'}>{BASE_URL}</code></span>
              <span>Site: <code className={dark ? 'text-zinc-300' : 'text-zinc-600'}>{SITE_ID}</code></span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setEditorOpen(!editorOpen)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                editorOpen
                  ? dark
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                    : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : dark
                    ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                    : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              <svg className="w-4 h-4 inline -mt-0.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
              Theme
            </button>
            <button
              onClick={toggleDark}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                dark
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                  : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {dark ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>

        <LitemetricsProvider
          baseUrl={BASE_URL}
          siteId={SITE_ID}
          secretKey={SECRET_KEY || undefined}
          defaultPeriod="7d"
          theme={theme}
          darkTheme={darkThemeOverride}
        >
          {editorOpen && (
            <ThemeEditor
              dark={dark}
              activePreset={activePreset}
              onSelect={handleSelect}
              onReset={handleReset}
              onToggleDark={toggleDark}
            />
          )}
          <AnalyticsDashboard
            showWorldMap={true}
            showPieCharts={true}
            showExport={true}
          />
        </LitemetricsProvider>
      </div>
    </div>
  );
}
