import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { createClient, createSitesClient, type InsaytClient } from '@insayt/client';

const STORAGE_KEY = 'insayt_admin_secret';
const BASE_URL = import.meta.env.VITE_INSAYT_URL || '';

interface AuthContextValue {
  adminSecret: string | null;
  isAuthenticated: boolean;
  login: (secret: string) => Promise<boolean>;
  logout: () => void;
  client: InsaytClient;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function makeClient(secret: string | null): InsaytClient {
  return createClient({
    baseUrl: BASE_URL,
    siteId: 'default',
    headers: secret ? { 'X-Insayt-Admin-Secret': secret } : undefined,
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [adminSecret, setAdminSecret] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [client, setClient] = useState<InsaytClient>(() => makeClient(adminSecret));

  const login = useCallback(async (secret: string): Promise<boolean> => {
    try {
      const sitesClient = createSitesClient({ baseUrl: BASE_URL, adminSecret: secret });
      await sitesClient.listSites();
      localStorage.setItem(STORAGE_KEY, secret);
      setAdminSecret(secret);
      setClient(makeClient(secret));
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAdminSecret(null);
    setClient(makeClient(null));
  }, []);

  return (
    <AuthContext.Provider value={{ adminSecret, isAuthenticated: !!adminSecret, login, logout, client }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
