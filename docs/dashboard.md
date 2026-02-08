# Dashboard

React-based analytics dashboard. Shows metrics, charts, maps, and user data.

## Setup

Requires a running Litemetrics server and a site with `siteId` + `secretKey`.

Create `apps/dashboard/.env`:

```env
VITE_LITEMETRICS_API_URL=http://localhost:3002
VITE_LITEMETRICS_SITE_ID=your_site_id
VITE_LITEMETRICS_SECRET=your_secret_key
```

Run locally:

```bash
bun run --filter @litemetrics/dashboard dev
```

Opens at `http://localhost:5173`.

Build for production:

```bash
bun run --filter @litemetrics/dashboard build
```

Output in `apps/dashboard/dist/`. The `@litemetrics/server` package serves this automatically.

## Pages

### Analytics (`/`)

Main overview page:
- Stat cards: pageviews, visitors, sessions, events, conversions (with % change vs previous period)
- Time series chart (pageviews/visitors/sessions over time)
- World map showing visitor distribution by country
- Pie charts for browser and device breakdown
- Top lists: pages, referrers, countries, events, conversions, browsers, devices
- Period selector: 7d, 14d, 30d, 90d, or custom date range
- Export data as CSV

### Realtime (`/realtime`)

Live monitoring:
- Active visitors count (last 30 minutes, refreshes every 10 seconds)
- Active pages with visitor counts
- Recent event feed with browser/device icons and timestamps

### Events (`/events`)

Event explorer:
- Paginated list of all tracked events
- Filter by event type (pageview, event, identify, conversions)
- Click through to user details
- Export as CSV

### Users (`/users`)

Visitor explorer:
- List of tracked visitors with activity stats
- Search by visitor ID or user ID
- Click through to individual user profiles and event history
- Export as CSV

### Retention (`/retention`)

Cohort retention analysis:
- Heatmap table showing weekly retention rates
- Rows = cohort weeks, columns = weeks since first visit
- Color intensity indicates retention percentage
- Configurable period and week count (4-12 weeks)
- Export as CSV

### Sites (`/sites`)

Site management:
- Create, edit, delete tracked sites
- View site IDs and secret keys
- Regenerate secret keys
- Configure conversion event names per site

## Navigation

Sidebar with links to all pages. Site selector at the top for switching between sites. Login/logout at the bottom.

## Tech Stack

- React 19
- React Router 7
- Vite 6
- Tailwind CSS 3
- Recharts 2 (charts)
- react-simple-maps (world map)
- react-icons (browser/OS/device icons)
- @litemetrics/client (API queries)
