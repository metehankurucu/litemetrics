// IMPORTANT: keep this list in sync with `routes.tsx`.
// `routes.tsx` defines React routes for vite-react-ssg.
// `scripts/generate-sitemap.ts` reads this file (no React imports).
// If you add a route in `routes.tsx`, also add its path here.
export const allRoutePaths = [
  '/',
  '/docs/quickstart',
  '/docs/react',
  '/docs/clickhouse-setup',
  '/docs/postgres-setup',
  '/vs/plausible',
  '/vs/umami',
  '/vs/posthog',
  '/for/saas',
  '/for/embedded-analytics',
] as const;

export type RoutePath = (typeof allRoutePaths)[number];
