# Dashboard UI Integration (@litemetrics/ui)

Embed a full analytics dashboard in any React app.

## Install

```bash
npm install @litemetrics/ui @litemetrics/client @litemetrics/core
# peer dependencies
npm install react react-dom recharts @tanstack/react-query
# optional — for WorldMap widget
npm install react-simple-maps
```

## Quick Start — Full Dashboard

```tsx
import { LitemetricsProvider, AnalyticsDashboard } from '@litemetrics/ui';

function AnalyticsPage() {
  return (
    <LitemetricsProvider
      baseUrl="https://your-server.com"
      siteId="your-site-id"
      secretKey="sk_..."
    >
      <AnalyticsDashboard
        showWorldMap={true}
        showPieCharts={true}
        showExport={true}
      />
    </LitemetricsProvider>
  );
}
```

## Provider Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `baseUrl` | `string` | required | Litemetrics server URL |
| `siteId` | `string` | required | Site ID |
| `secretKey` | `string` | — | Secret key for auth |
| `defaultPeriod` | `Period` | `'7d'` | Initial time period |
| `queryClient` | `QueryClient` | — | External React Query client |
| `staleTime` | `number` | `30000` | Query stale time (ms) |
| `theme` | `Partial<LitemetricsTheme>` | — | Light theme overrides |
| `darkTheme` | `Partial<LitemetricsTheme>` | — | Dark theme overrides |

## Theming

All colors use CSS custom properties (`--lm-*`) with RGB triplet values (e.g., `99 102 241`).

### Custom Accent Color

```tsx
<LitemetricsProvider theme={{ accent: '59 130 246' }}>
```

### Full Theme Override

```tsx
import type { LitemetricsTheme } from '@litemetrics/ui';

const theme: Partial<LitemetricsTheme> = {
  accent: '59 130 246',
  accentLight: '219 234 254',
  bg: '255 255 255',
  text: '15 23 42',
};

<LitemetricsProvider theme={theme} darkTheme={{ accent: '96 165 250' }}>
```

### Dark Mode

Add `dark` class to `<html>` or any parent element. Components auto-switch.

```js
document.documentElement.classList.toggle('dark');
```

## Individual Widgets

Use specific widgets instead of the full dashboard:

```tsx
import {
  StatCards, TimeSeriesChart, TopPages, TopReferrers,
  TopCountries, TopConversions, BrowsersChart, DevicesChart, WorldMap,
  PeriodSelector, ExportButton,
} from '@litemetrics/ui';

<LitemetricsProvider baseUrl="..." siteId="...">
  <PeriodSelector />
  <StatCards />
  <TimeSeriesChart />
  <TopPages limit={10} />
  <TopReferrers />
  <TopCountries />
  <TopConversions />
  <BrowsersChart />
  <DevicesChart />
  <WorldMap />
  <ExportButton />
</LitemetricsProvider>
```

## Hooks

```tsx
import { useStats, useTimeSeries, useOverview, useLitemetricsUI } from '@litemetrics/ui';

// Query any metric
const { data, isLoading } = useStats('pageviews', { period: '7d' });

// Time series data for charts
const timeseries = useTimeSeries('visitors', { period: '30d' });

// Overview with comparison
const overview = useOverview({ period: '7d', compare: true }); // includes conversions by default

// Access provider context
const { client, period, setPeriod } = useLitemetricsUI();
```

## Tailwind CSS Integration

Add the UI package to Tailwind content paths:

```js
// tailwind.config.js
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/@litemetrics/ui/dist/**/*.js',
  ],
};
```
