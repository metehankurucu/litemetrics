# Dashboard

React-based analytics dashboard. Shows metrics, charts, maps, and user data.

This page documents the web dashboard in `apps/dashboard`.
For the native mobile client, see [`apps/mobile/README.md`](../apps/mobile/README.md).

## Setup

Requires a running Litemetrics server and a site with `siteId` + `secretKey`.

Create `apps/dashboard/.env`:

```env
VITE_LITEMETRICS_URL=http://localhost:3002
VITE_LITEMETRICS_SITE_ID=your_site_id
VITE_LITEMETRICS_ADMIN_SECRET=your_admin_secret
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
- **Include bot traffic** toggle — flips the `includeBots` flag on every query (defaults to off, so flagged bots are excluded)
- A bot-traffic pill appears when the filter has dropped events in the current window
- Export data as CSV

### Insights (`/insights`)

Behavioral analytics:
- Hourly distribution charts (busy hours, conversion hours)
- Top exit pages, transitions, scroll pages, button clicks, link targets

### Campaigns (`/campaigns`)

UTM and channel tracking:
- 6 tabs: Channels, Sources, Mediums, Campaigns, Terms, Contents
- Pie charts and top lists for each UTM parameter

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
- Per-user **Delete all events** destructive action on the detail page (GDPR / right-to-erasure). Calls `DELETE /api/users/:identifier/events` and shows the deleted count.
- Export as CSV

### Retention (`/retention`)

Cohort retention analysis:
- Heatmap table showing weekly retention rates
- Rows = cohort weeks, columns = weeks since first visit
- Color intensity indicates retention percentage
- Configurable period and week count (4-12 weeks)
- Export as CSV

### Settings (`/sites`)

Settings for the currently selected site (formerly the "Sites" page, which listed every site at once):
- View site ID and secret key, regenerate secret
- Edit name, allowed origins, conversion event names
- **Bot filter mode** — per-site override (`off` / `standard` / `strict` / `shadow`, or "use server default")
- Delete the site

## Navigation

The sidebar links to every page. The currently selected site is shown at the top — clicking it (or pressing **⌘K** / **Ctrl K**) opens a `cmdk` command palette for fast site switching, creating a new site, and jumping between pages. The selected site is what every page (including Settings) operates on; site management is no longer a multi-row table. Login / logout lives at the bottom.

## Tech Stack

- React 19
- React Router 7
- Vite 6
- Tailwind CSS 3
- Recharts 2 (charts)
- react-simple-maps (world map)
- lucide-react (icons)
- cmdk (⌘K command palette)
- @litemetrics/client (API queries)

## See Also

- [CLI](../packages/cli/README.md) -- Same data accessible from the terminal
