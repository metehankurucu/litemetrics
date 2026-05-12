import { Outlet } from 'react-router-dom';
import { LitemetricsProvider } from '@litemetrics/react';

export default function RootLayout() {
  return (
    <LitemetricsProvider
      siteId={import.meta.env.VITE_LITEMETRICS_SITE_ID}
      endpoint={import.meta.env.VITE_LITEMETRICS_ENDPOINT}
    >
      <Outlet />
    </LitemetricsProvider>
  );
}
