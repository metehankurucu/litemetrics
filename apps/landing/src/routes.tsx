import { lazy } from 'react';
import type { RouteRecord } from 'vite-react-ssg';
import RootLayout from './RootLayout';

export const routes: RouteRecord[] = [
  {
    path: '/',
    Component: RootLayout,
    children: [
      {
        index: true,
        Component: lazy(() => import('./pages/Home')),
        entry: 'src/pages/Home.tsx',
      },
      {
        path: 'docs/quickstart',
        Component: lazy(() => import('./pages/docs/Quickstart')),
        entry: 'src/pages/docs/Quickstart.tsx',
      },
      {
        path: 'docs/react',
        Component: lazy(() => import('./pages/docs/React')),
        entry: 'src/pages/docs/React.tsx',
      },
      {
        path: 'docs/clickhouse-setup',
        Component: lazy(() => import('./pages/docs/ClickhouseSetup')),
        entry: 'src/pages/docs/ClickhouseSetup.tsx',
      },
      {
        path: 'docs/postgres-setup',
        Component: lazy(() => import('./pages/docs/PostgresSetup')),
        entry: 'src/pages/docs/PostgresSetup.tsx',
      },
      {
        path: 'vs/plausible',
        Component: lazy(() => import('./pages/vs/Plausible')),
        entry: 'src/pages/vs/Plausible.tsx',
      },
      {
        path: 'vs/umami',
        Component: lazy(() => import('./pages/vs/Umami')),
        entry: 'src/pages/vs/Umami.tsx',
      },
      {
        path: 'vs/posthog',
        Component: lazy(() => import('./pages/vs/Posthog')),
        entry: 'src/pages/vs/Posthog.tsx',
      },
      {
        path: 'for/saas',
        Component: lazy(() => import('./pages/for/Saas')),
        entry: 'src/pages/for/Saas.tsx',
      },
      {
        path: 'for/embedded-analytics',
        Component: lazy(() => import('./pages/for/EmbeddedAnalytics')),
        entry: 'src/pages/for/EmbeddedAnalytics.tsx',
      },
    ],
  },
];

export { allRoutePaths } from './route-paths';
