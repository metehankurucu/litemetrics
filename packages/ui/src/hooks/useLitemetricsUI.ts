import { useContext } from 'react';
import { LitemetricsUIContext, type LitemetricsUIContextValue } from '../context/LitemetricsUIContext';

export function useLitemetricsUI(): LitemetricsUIContextValue {
  const ctx = useContext(LitemetricsUIContext);
  if (!ctx) {
    throw new Error('useLitemetricsUI must be used within a <LitemetricsProvider>');
  }
  return ctx;
}
