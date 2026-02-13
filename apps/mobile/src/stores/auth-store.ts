import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../lib/secure-storage';

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
}

interface AuthState {
  providers: Provider[];
  activeProviderId: string | null;
  activeSiteId: string;
  adminSecret: string | null;
  isLoading: boolean;
  _hasHydrated: boolean;

  addProvider: (provider: Provider & { adminSecret: string }) => Promise<void>;
  removeProvider: (id: string) => Promise<void>;
  setActiveProvider: (id: string, adminSecret?: string) => Promise<void>;
  setActiveSite: (siteId: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
}

const SECRET_PREFIX = 'litemetrics_secret_';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      providers: [],
      activeProviderId: null,
      activeSiteId: '',
      adminSecret: null,
      isLoading: true,
      _hasHydrated: false,

      addProvider: async (provider) => {
        const { providers } = get();
        const newProviders = [...providers, { id: provider.id, name: provider.name, baseUrl: provider.baseUrl }];
        try {
          await setSecureItem(`${SECRET_PREFIX}${provider.id}`, provider.adminSecret);
        } catch {
          // SecureStore write failed — continue anyway, secret will be in memory
        }
        set({
          providers: newProviders,
          activeProviderId: provider.id,
          adminSecret: provider.adminSecret,
          activeSiteId: '',
        });
      },

      removeProvider: async (id) => {
        const { providers, activeProviderId } = get();
        const newProviders = providers.filter((p) => p.id !== id);
        try {
          await deleteSecureItem(`${SECRET_PREFIX}${id}`);
        } catch {
          // SecureStore delete failed — not critical
        }
        set({
          providers: newProviders,
          activeProviderId: activeProviderId === id ? null : activeProviderId,
          activeSiteId: activeProviderId === id ? '' : get().activeSiteId,
          adminSecret: activeProviderId === id ? null : get().adminSecret,
        });
      },

      setActiveProvider: async (id, secret) => {
        const { providers } = get();
        const provider = providers.find((p) => p.id === id);
        if (!provider) return;
        let adminSecret = secret ?? null;
        if (!adminSecret) {
          try {
            adminSecret = await getSecureItem(`${SECRET_PREFIX}${id}`);
          } catch {
            adminSecret = null;
          }
        }
        if (adminSecret) {
          try {
            await setSecureItem(`${SECRET_PREFIX}${id}`, adminSecret);
          } catch {
            // ignore
          }
        }
        set({ activeProviderId: id, adminSecret, activeSiteId: '' });
      },

      setActiveSite: (siteId) => {
        set({ activeSiteId: siteId });
      },

      clearAuth: () => {
        set({ activeProviderId: null, activeSiteId: '', adminSecret: null });
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },
    }),
    {
      name: 'litemetrics_auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        providers: state.providers,
        activeProviderId: state.activeProviderId,
        activeSiteId: state.activeSiteId,
      }),
      onRehydrateStorage: () => {
        return async (state) => {
          try {
            if (state?.activeProviderId) {
              const secret = await getSecureItem(`${SECRET_PREFIX}${state.activeProviderId}`);
              if (secret) {
                useAuthStore.setState({ adminSecret: secret, isLoading: false, _hasHydrated: true });
                return;
              }
            }
          } catch {
            // SecureStore read failed during hydration
          }
          useAuthStore.setState({ isLoading: false, _hasHydrated: true });
        };
      },
    }
  )
);
