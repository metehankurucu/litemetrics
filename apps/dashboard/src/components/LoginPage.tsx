import { useState } from 'react';

interface LoginPageProps {
  onLogin: (secret: string) => Promise<boolean>;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret.trim()) return;

    setLoading(true);
    setError('');

    const ok = await onLogin(secret.trim());
    if (!ok) {
      setError('Invalid admin secret');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-indigo-50/30 to-zinc-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Litemetrics" className="h-16 mx-auto mb-4" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Enter your admin secret to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-7 shadow-lg">
          <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
            Admin Secret
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Enter admin secret..."
            autoFocus
            className="w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm dark:text-zinc-200"
          />

          {error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !secret.trim()}
            className="mt-5 w-full bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white text-sm font-semibold py-2.5 px-4 rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 mt-6">
          Powered by <a href="https://github.com/metehankurucu/litemetrics" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">Litemetrics</a>
        </p>
      </div>
    </div>
  );
}
