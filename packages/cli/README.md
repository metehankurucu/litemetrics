# @litemetrics/cli

Command-line tool for querying Litemetrics analytics data and managing sites. Designed for both human use and AI agent integration.

## Installation

```bash
bun add -g @litemetrics/cli
```

Or run directly from the monorepo:

```bash
cd packages/cli && bun run build
node dist/index.js
```

## Configuration

The CLI needs a server URL and admin secret. These can be provided in three ways (higher priority wins):

### 1. CLI Flags

```bash
litemetrics overview --url https://metrics.example.com --secret my-secret --site site_abc123
```

### 2. Environment Variables

```bash
export LITEMETRICS_URL=https://metrics.example.com
export LITEMETRICS_ADMIN_SECRET=my-secret
export LITEMETRICS_SITE_ID=site_abc123
```

### 3. Config File (`~/.litemetricsrc`)

```json
{
  "url": "https://metrics.example.com",
  "adminSecret": "my-secret",
  "siteId": "site_abc123"
}
```

## Output Formats

| Format | Flag | Default When | Description |
|--------|------|-------------|-------------|
| `table` | `-f table` | Interactive terminal (TTY) | Human-readable aligned columns |
| `json` | `-f json` | Piped output | Machine-parseable JSON |
| `csv` | `-f csv` | — | Comma-separated values |

```bash
# Force JSON output
litemetrics overview -f json

# Pipe to jq
litemetrics overview | jq '.pageviews.total'

# Export to CSV
litemetrics stats top_pages -f csv > pages.csv
```

You can also set the default format via environment variable:

```bash
export LITEMETRICS_FORMAT=json
```

### Compact JSON

By default JSON is pretty-printed (2-space). Pass `--compact` (or set `LITEMETRICS_COMPACT=1`) to emit single-line JSON, which is cheaper for agents to read:

```bash
litemetrics overview -p 7d -f json --compact
# {"pageviews":{"total":206,...},"visitors":{...}}
```

## Global Options

These options are available on all commands:

```
--url <url>           Litemetrics server URL
--secret <secret>     Admin secret
--site <siteId>       Site ID (or a comma-separated list to query several sites)
-f, --format <fmt>    Output format: json, table, csv
--compact             Single-line JSON output (or LITEMETRICS_COMPACT=1)
-V, --version         Show version
-h, --help            Show help
```

### Multiple sites in one call

`--site` accepts a comma-separated list. Querying several sites runs the query
per site in-process and returns one JSON object keyed by site ID:

```bash
litemetrics overview -p 7d --site site_a,site_b -f json | jq 'keys'
# ["site_a", "site_b"]
```

- Single site: output is unchanged (the raw result object).
- Multiple sites: the top-level keys are the site IDs; table mode prints one
  section per site.
- If any site fails, its message is collected under an `"errors"` key
  (`{"site_a": {...}, "errors": {"site_b": "Unauthorized ..."}}`), the successful
  sites are still emitted, and the process exits `1`. JSON is the recommended
  format for multi-site queries.

---

## Commands

### `overview`

Fetch all key metrics at once. Mirrors the dashboard homepage.

```bash
litemetrics overview [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --period <period>` | `1h`, `24h`, `7d`, `30d`, `90d`, `custom` | `24h` |
| `--from <date>` | Start date (ISO format) | — |
| `--to <date>` | End date (ISO format) | — |
| `-c, --compare` | Include comparison with previous period | `false` |
| `-m, --metrics <list>` | Comma-separated metrics to fetch | `pageviews,visitors,sessions,events,conversions` |

```bash
# Last 7 days with comparison
litemetrics overview -p 7d --compare

# Custom date range
litemetrics overview -p custom --from 2026-01-01 --to 2026-01-31

# Only specific metrics
litemetrics overview -m pageviews,visitors -p 30d
```

**Example output:**

```
 Metric      | Total | Previous | Change
-------------+-------+----------+--------
 pageviews   | 206   | 130      | +58.5%
 visitors    | 54    | 64       | -15.6%
 sessions    | 77    | 113      | -31.9%
 events      | 994   | 336      | +195.8%
 conversions | 1     | 1        | 0.0%
```

---

### `stats`

Query any single metric. Use for aggregate counts or top-N lists.

```bash
litemetrics stats <metric> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --period <period>` | `1h`, `24h`, `7d`, `30d`, `90d`, `custom` | `24h` |
| `--from <date>` | Start date (ISO format) | — |
| `--to <date>` | End date (ISO format) | — |
| `-l, --limit <n>` | Limit results for `top_*` metrics (default 10, **capped at 1000**) | `10` |
| `--filter <key=value>` | Filter (repeatable) — run `litemetrics filters` for keys | — |
| `-c, --compare` | Include comparison with previous period | `false` |
| `--timezone <tz>` | IANA timezone for bucketing (e.g. `Europe/Istanbul`) | UTC |
| `--include-bots` | Include events flagged by the bot filter | `false` |

> Unknown metric names are rejected with a "did you mean…" suggestion. Run `litemetrics metrics` for the full list.
>
> `-l` is clamped server-side to **1000** for `top_*` metrics, so a request for
> `-l 100000` returns at most 1000 rows. An invalid `--period` (any token outside
> `1h|24h|7d|30d|90d|custom`, or `custom` without both `--from` and `--to`) is
> rejected with exit `1` and a suggestions envelope; it is never silently
> coerced to a default period.

**Available metrics:**

| Category | Metrics |
|----------|---------|
| Aggregate | `pageviews`, `visitors`, `sessions`, `events`, `conversions` |
| Pages | `top_pages`, `top_exit_pages`, `top_transitions`, `top_scroll_pages` |
| Sources | `top_referrers`, `top_channels` |
| Geography | `top_countries`, `top_cities` |
| Technology | `top_browsers`, `top_devices`, `top_os` |
| Mobile | `top_os_versions`, `top_device_models`, `top_app_versions` |
| Events | `top_events`, `top_conversions`, `top_button_clicks`, `top_link_targets` |
| Campaigns | `top_utm_sources`, `top_utm_mediums`, `top_utm_campaigns`, `top_utm_terms`, `top_utm_contents` |

```bash
# Top pages last 7 days
litemetrics stats top_pages -p 7d -l 20

# Visitor count with comparison
litemetrics stats visitors -p 30d --compare

# Top browsers filtered by country
litemetrics stats top_browsers -p 30d --filter "geo.country=US"

# Multiple filters
litemetrics stats top_pages --filter "geo.country=TR" --filter "device.type=mobile"

# UTM sources
litemetrics stats top_utm_sources -p 90d
```

**Example output (top metric):**

```
 Key              | Value
------------------+------
 Chrome           | 45
 Mobile Chrome    | 40
 Mobile Safari    | 9
 Samsung Internet | 4
------------------+------
Total: 98
```

**Available filter keys:**

| Category | Keys |
|----------|------|
| Geography | `geo.country`, `geo.region`, `geo.city` |
| Device | `language`, `device.type`, `device.browser`, `device.os`, `device.osVersion`, `device.deviceModel`, `device.deviceBrand`, `device.appVersion` |
| Attribution | `referrer`, `channel`, `utm.source`, `utm.medium`, `utm.campaign`, `utm.term`, `utm.content` |
| Event | `event_source`, `event_subtype`, `event_name`, `type`, `page_path`, `target_url_path` |

---

### `timeseries`

Query time series data for trends.

```bash
litemetrics timeseries <metric> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --period <period>` | `1h`, `24h`, `7d`, `30d`, `90d`, `custom` | `7d` |
| `--from <date>` | Start date (ISO format) | — |
| `--to <date>` | End date (ISO format) | — |
| `-g, --granularity <g>` | `hour`, `day`, `week`, `month` | auto |
| `--filter <key=value>` | Filter (repeatable) | — |
| `--timezone <tz>` | IANA timezone for bucketing (e.g. `Europe/Istanbul`) | UTC |
| `--include-bots` | Include events flagged by the bot filter | `false` |

Metrics: `pageviews`, `visitors`, `sessions`, `events`, `conversions`

> The response is bounded to **2000 buckets**. A period × granularity that would
> exceed that (e.g. `-p 90d -g hour`) is rejected with exit `1` and a message
> suggesting a coarser granularity.

```bash
# Daily pageviews for 30 days
litemetrics timeseries pageviews -p 30d -g day

# Hourly visitors for 24 hours
litemetrics timeseries visitors -p 24h -g hour

# Weekly sessions for 90 days
litemetrics timeseries sessions -p 90d -g week
```

**Example output:**

```
 Date                     | Value
--------------------------+------
 2026-02-14T00:00:00.000Z | 7
 2026-02-15T00:00:00.000Z | 13
 2026-02-16T00:00:00.000Z | 7
 2026-02-17T00:00:00.000Z | 13
 2026-02-18T00:00:00.000Z | 6
 2026-02-19T00:00:00.000Z | 131
 2026-02-20T00:00:00.000Z | 23
--------------------------+------
Metric: pageviews | Granularity: day
```

---

### `events`

List individual events with filtering and pagination.

```bash
litemetrics events [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --type <type>` | `pageview`, `event`, `identify` | all |
| `-n, --name <name>` | Filter by event name | — |
| `--names <list>` | Comma-separated event names | — |
| `--source <source>` | `auto`, `manual` | all |
| `--visitor <id>` | Filter by visitor ID | — |
| `--user <id>` | Filter by user ID | — |
| `-p, --period <period>` | `1h`, `24h`, `7d`, `30d`, `90d`, `custom` | `24h` |
| `--from <date>` | Start date (ISO format) | — |
| `--to <date>` | End date (ISO format) | — |
| `-l, --limit <n>` | Limit results (default 50, **capped at 200**) | `50` |
| `--offset <n>` | Offset for pagination | `0` |
| `--include-bots` | Include events flagged by the bot filter | `false` |

> `events` (and `users` / `users events`) clamp `-l` to **200** server-side; page
> through larger result sets with `--offset`.

```bash
# Recent events
litemetrics events -p 24h

# Only pageviews
litemetrics events -t pageview -p 7d

# Events by name
litemetrics events -t event -n signup -p 30d

# Events for a specific visitor
litemetrics events --visitor abc123 -p 7d

# Paginate
litemetrics events -l 50 --offset 50
```

**Example output:**

```
 Time                | Type     | Detail                      | Visitor      | Country | City
---------------------+----------+-----------------------------+--------------+---------+-----
 21.02.2026 12:30:52 | event    | api_error                   | 24707b365e29 | TR      |
 21.02.2026 12:29:31 | identify | 69997afa7b563897c411c535    | 24707b365e29 | TR      |
 21.02.2026 12:29:13 | pageview | https://flast.ai/auth/login | 24707b365e29 | TR      |
---------------------+----------+-----------------------------+--------------+---------+-----
Total: 110 | Showing: 0-50
```

---

### `users`

List users, get user details, or view a user's events.

#### List users

```bash
litemetrics users [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-s, --search <query>` | Search by visitor or user ID | — |
| `-l, --limit <n>` | Limit results | `30` |
| `--offset <n>` | Offset for pagination | `0` |
| `--include-bots` | Include events flagged by the bot filter | `false` |

```bash
litemetrics users -l 20
litemetrics users --search "user@example.com"
```

**Example output:**

```
 User                     | Visitor ID   | Events | Pages | Sessions | Last Seen           | Country
--------------------------+--------------+--------+-------+----------+---------------------+--------
 69997afa7b563897c411c535 | 24707b365e29 | 53     | 2     | 2        | 21.02.2026 12:30:52 | TR
 Anonymous                | 6ae2d2d231c9 | 6      | 2     | 1        | 21.02.2026 12:19:04 |
--------------------------+--------------+--------+-------+----------+---------------------+--------
Total: 106 | Showing: 0-20
```

#### User detail

```bash
litemetrics users detail <identifier>
```

The identifier can be a `visitorId` or `userId`.

```bash
litemetrics users detail "24707b365e29264b"
litemetrics users detail "user@example.com"
```

**Example output:**

```
 Field           | Value
-----------------+----------------------------------
 User ID         | 69997afa7b563897c411c535
 Visitor ID      | 24707b365e29264b
 Linked Devices  | 1
 First Seen      | 21.02.2026 12:27:54
 Last Seen       | 21.02.2026 12:30:52
 Total Events    | 53
 Total Pageviews | 2
 Total Sessions  | 2
 Last URL        | https://flast.ai/auth/login
 Country         | TR
 Browser         | Chrome
 OS              | macOS
 Device          | desktop
 Language        | tr-TR
 Timezone        | Europe/Istanbul
 Traits          | {"email":"user@example.com",...}
```

#### User events

```bash
litemetrics users events <identifier> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --type <type>` | `pageview`, `event`, `identify` | all |
| `-n, --name <name>` | Filter by event name | — |
| `-p, --period <period>` | Period | `30d` |
| `-l, --limit <n>` | Limit results | `30` |
| `--offset <n>` | Offset for pagination | `0` |

```bash
litemetrics users events "24707b365e29264b" -p 7d -l 50
litemetrics users events "24707b365e29264b" -t pageview
```

---

### `retention`

Query cohort retention data.

```bash
litemetrics retention [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --period <period>` | `7d`, `30d`, `90d` | `90d` |
| `-w, --weeks <n>` | Number of weeks | `8` |
| `--include-bots` | Include events flagged by the bot filter | `false` |

```bash
litemetrics retention -p 90d -w 12
litemetrics retention -p 30d -w 4
```

**Example output:**

```
 Week     | Size | W0    | W1   | W2
----------+------+-------+------+-----
 2026-W07 | 42   | 76.2% | 0.0% | 0.0%
 2026-W08 | 53   | 39.6% | 0.0%
 2026-W09 | 22   | 0.0%
```

---

### `bots`

Show how many events the bot filter flagged, broken down by detection layer.

```bash
litemetrics bots [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --period <period>` | `1h`, `24h`, `7d`, `30d`, `90d`, `custom` | `24h` |
| `--from <date>` | Start date (ISO format) | — |
| `--to <date>` | End date (ISO format) | — |

```bash
litemetrics bots -p 7d
```

**Example output:**

```
 Layer      | Flagged
------------+--------
 signature  | 128
 heuristic  | 14
 rate-limit | 3
------------+--------
Total flagged: 145
```

Re-run any metric with `--include-bots` to see totals that include this flagged traffic.

---

### `metrics`

List every metric you can pass to `stats` / `timeseries`. No server call — works offline.

```bash
litemetrics metrics
```

### `filters`

List every `--filter key=value` key with an example value. No server call.

```bash
litemetrics filters
```

---

### `sites`

Manage sites (requires admin secret).

#### List sites

```bash
litemetrics sites
litemetrics sites list
```

**Example output:**

```
 Site ID           | Name          | Type | Domain     | Created
-------------------+---------------+------+------------+-----------
 site_n9e384ggh36q | flast.ai      | web  | flast.ai   | 08.02.2026
 site_5dv1pv4y3714 | Ok Nok App    | app  | -          | 10.02.2026
-------------------+---------------+------+------------+-----------
Total: 2 sites
```

#### Get site details

```bash
litemetrics sites get <siteId>
```

```bash
litemetrics sites get site_n9e384ggh36q
```

#### Create a site

```bash
litemetrics sites create [options]
```

| Option | Description | Required |
|--------|-------------|----------|
| `-n, --name <name>` | Site name | Yes |
| `--type <type>` | `web` or `app` | No |
| `--domain <domain>` | Domain | No |
| `--origins <list>` | Comma-separated allowed origins | No |
| `--conversions <list>` | Comma-separated conversion event names | No |

```bash
litemetrics sites create -n "My Blog" --type web --domain blog.example.com
litemetrics sites create -n "Mobile App" --type app --conversions "signup,purchase"
```

#### Update a site

```bash
litemetrics sites update <siteId> [options]
```

Same options as `create` (all optional).

```bash
litemetrics sites update site_abc123 --name "New Name"
litemetrics sites update site_abc123 --origins "example.com,www.example.com"
litemetrics sites update site_abc123 --conversions "signup,purchase,checkout"
```

#### Delete a site

```bash
litemetrics sites delete <siteId>
```

#### Regenerate secret key

```bash
litemetrics sites regenerate <siteId>
```

---

## AI Agent Usage

The CLI is designed for AI agent integration. When output is piped (non-TTY), it automatically outputs JSON:

```bash
# Discover the surface first (no server call, no site needed)
litemetrics metrics | jq -r '.[].metric'
litemetrics filters | jq -r '.[].key'

# Automatically JSON when piped
litemetrics overview -p 7d | jq '.pageviews.total'

# Parse with any language
litemetrics stats top_countries -p 30d | python3 -c "import sys,json; print(json.load(sys.stdin))"

# Chain commands
SITE=$(litemetrics sites | jq -r '.sites[0].siteId')
litemetrics overview --site $SITE -p 7d --compare
```

Conveniences for agents:
- **Site auto-resolve** — if no `--site` / `LITEMETRICS_SITE_ID` is set and the account has exactly one site, the CLI uses it automatically (a note is printed to stderr). With multiple sites it lists them and exits.
- **Multi-site** - `--site a,b` queries several sites in one call; the JSON result is keyed by site ID (see [Multiple sites in one call](#multiple-sites-in-one-call)).
- **Compact JSON** - `--compact` (or `LITEMETRICS_COMPACT=1`) emits single-line JSON.
- **Metric suggestions** - an unknown metric exits `1` with `{"error": "...", "suggestions": [...]}`.
- **Strict periods** - an invalid `--period` (or `custom` missing `--from`/`--to`) exits `1` with suggestions instead of silently defaulting.

## Output contract for agents

The CLI is safe to parse programmatically because it holds to a fixed contract:

- **stdout is data only.** Query results (JSON / table / CSV) go to stdout and nothing else: no logs, prompts, spinners, or ANSI. Notes and diagnostics (e.g. the site auto-resolve note) go to **stderr**.
- **Exit codes.** `0` on success, `1` on any error (bad input, config missing, server error, or any failed site in a multi-site run).
- **Error envelope.** In JSON mode every error is a single-line object on stderr:
  ```json
  {"error": "Unauthorized - invalid or missing admin secret", "status": 401, "suggestions": ["..."]}
  ```
  - `error` is the server's explanatory message when there is one (the CLI surfaces `response.data.error`, not the opaque `Request failed with status code 401`), otherwise the underlying error message.
  - `status` is present when the failure came from an HTTP response (the status code).
  - `suggestions` is present for did-you-mean cases (unknown metric, invalid period/format).
- **Caps are silent and safe.** `top_*` limits clamp to 1000; `events`/`users` limits clamp to 200; `timeseries` is bounded to 2000 buckets (over-wide requests are rejected, not truncated). You never receive more rows than the cap, and a too-coarse-vs-too-wide `timeseries` fails loudly rather than returning a giant payload.
- **Compact + pretty both parse.** Default JSON is pretty-printed; `--compact` is single-line. Both are valid JSON.

Error handling summary:
- Errors are printed to **stderr** (data stays on stdout).
- Exit code `0` for success, `1` for errors.
- JSON errors: `{"error": "message", "status"?: <http>, "suggestions"?: [...]}`.
