import { useState, useEffect } from 'react';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'lm_theme';

// Run before React renders to prevent flash of wrong theme
function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Apply immediately at module scope
const initialTheme = getInitialTheme();
document.documentElement.classList.toggle('dark', initialTheme === 'dark');

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return { theme, toggleTheme };
}
