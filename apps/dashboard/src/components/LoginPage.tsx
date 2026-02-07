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
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Litemetrics" className="h-16 mx-auto mb-4" />
          <p className="text-sm text-zinc-500">Enter your admin secret to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
          <label className="block text-sm font-medium text-zinc-700 mb-2">
            Admin Secret
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Enter admin secret..."
            autoFocus
            className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />

          {error && (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !secret.trim()}
            className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-zinc-400 mt-6">
          Powered by <a href="https://github.com/metehankurucu/litemetrics" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-600 transition-colors">Litemetrics</a>
        </p>
      </div>
    </div>
  );
}
