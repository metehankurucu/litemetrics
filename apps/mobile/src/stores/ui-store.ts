import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getItem, setItem, removeItem } from '../lib/secure-storage';

export type Period = '1h' | '24h' | '7d' | '30d' | '90d' | 'custom';

interface UIState {
  period: Period;
  dateFrom: string;
  dateTo: string;
  theme: 'light' | 'dark' | 'system';
  setPeriod: (period: Period) => void;
  setDateRange: (from: string, to: string) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      period: '7d',
      dateFrom: '',
      dateTo: '',
      theme: 'system',
      setPeriod: (period) => set({ period }),
      setDateRange: (dateFrom, dateTo) => set({ dateFrom, dateTo, period: 'custom' }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'litemetrics_ui',
      storage: createJSONStorage(() => ({
        getItem: async (name: string) => {
          try {
            const item = await getItem(name);
            return item ? JSON.parse(item) : null;
          } catch {
            return null;
          }
        },
        setItem: async (name: string, value: string) => {
          await setItem(name, value);
        },
        removeItem: async (name: string) => {
          await removeItem(name);
        },
      })),
    }
  )
);
