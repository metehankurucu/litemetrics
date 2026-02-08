import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LitemetricsProvider } from '@litemetrics/react';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LitemetricsProvider
      siteId={import.meta.env.VITE_LITEMETRICS_SITE_ID}
      endpoint={import.meta.env.VITE_LITEMETRICS_ENDPOINT}
    >
      <App />
    </LitemetricsProvider>
  </StrictMode>
);
