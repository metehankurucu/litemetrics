import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LitemetricsProvider } from '@litemetrics/react';
import { App } from './App';

const LITEMETRICS_URL = import.meta.env.VITE_LITEMETRICS_URL || 'http://localhost:3002';
const SITE_ID = import.meta.env.VITE_LITEMETRICS_SITE_ID || 'demo';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LitemetricsProvider
      siteId={SITE_ID}
      endpoint={`${LITEMETRICS_URL}/api/collect`}
      autoPageView
      debug
    >
      <App />
    </LitemetricsProvider>
  </StrictMode>,
);
