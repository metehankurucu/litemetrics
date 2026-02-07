import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { InsaytProvider } from '@insayt/react';
import { App } from './App';

const INSAYT_URL = import.meta.env.VITE_INSAYT_URL || 'http://localhost:3002';
const SITE_ID = import.meta.env.VITE_INSAYT_SITE_ID || 'demo';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <InsaytProvider
      siteId={SITE_ID}
      endpoint={`${INSAYT_URL}/api/collect`}
      autoPageView
      debug
    >
      <App />
    </InsaytProvider>
  </StrictMode>,
);
