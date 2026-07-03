# Querying via the `litemetrics` CLI

`@litemetrics/cli` queries a Litemetrics server from the terminal. Install with `bun add -g @litemetrics/cli` (or `npm i -g`). It is designed for both humans and AI agents: table output in a TTY, JSON when piped.

## Config

Provide the server URL + admin secret via flags, env, or `~/.litemetricsrc` (higher priority wins):

- Flags: `--url`, `--secret`, `--site`
- Env: `LITEMETRICS_URL`, `LITEMETRICS_ADMIN_SECRET`, `LITEMETRICS_SITE_ID`
- File: `~/.litemetricsrc` (`{ "url", "adminSecret", "siteId" }`)

If no site is configured and the account has exactly one site, the CLI auto-resolves it. `--site` also accepts a comma-separated list (`--site a,b`) to query several sites in one call; see [Multi-site](#multi-site).

## Discover the surface (no server call)

```bash
litemetrics metrics    # every metric for stats / timeseries, with category
litemetrics filters    # every --filter key, with an example value
```

These read the catalog compiled into the CLI, so they never drift from the server.

## Commands

```bash
litemetrics overview -p 7d --compare                      # 5 aggregate totals
litemetrics stats <metric> -p 30d -l 20 [--filter k=v]    # one metric or top-N
litemetrics timeseries <metric> -p 30d -g day             # trend
litemetrics events -t event -n signup -p 30d -l 50        # raw events
litemetrics users [-s <query>]                            # list users
litemetrics users detail <visitorId|userId>               # one user
litemetrics users events <visitorId|userId> -t pageview   # a user's events
litemetrics retention -p 90d -w 8                         # weekly cohorts
litemetrics bots -p 7d                                    # bot-filter stats by layer
```

## Metrics

`stats <metric>` accepts every metric; the 5 aggregate ones also work with `timeseries`.

| Category | Metrics |
|---|---|
| aggregate (timeseries) | `pageviews` `visitors` `sessions` `events` `conversions` |
| pages | `top_pages` `top_exit_pages` `top_transitions` `top_scroll_pages` |
| acquisition | `top_referrers` `top_channels` `top_utm_sources` `top_utm_mediums` `top_utm_campaigns` `top_utm_terms` `top_utm_contents` |
| geo | `top_countries` `top_cities` |
| device | `top_devices` `top_browsers` `top_os` `top_os_versions` `top_device_models` `top_app_versions` |
| events | `top_events` `top_conversions` `top_button_clicks` `top_link_targets` |

`retention` and `bots` are their own commands.

## Filter keys (`--filter key=value`, repeatable, ANDed)

`geo.country` `geo.region` `geo.city` `language` `device.type` `device.browser` `device.os` `device.osVersion` `device.deviceModel` `device.deviceBrand` `device.appVersion` `utm.source` `utm.medium` `utm.campaign` `utm.term` `utm.content` `referrer` `channel` `event_source` `event_subtype` `event_name` `page_path` `target_url_path` `type`

`channel` is computed (Direct / Organic Search / Organic Social / Paid Search / Paid Social / Email / Display / Affiliate / Referral / Other). `utm.source` / `utm.medium` are normalized.

## Shared flags

| Flag | Meaning |
|---|---|
| `-p, --period` | `1h` `24h` `7d` `30d` `90d` `custom` (`--from`/`--to` for custom). Strict: an invalid token, or `custom` without both dates, exits `1` with suggestions, never silently defaulting |
| `-c, --compare` | period-over-period % change (aggregate metrics) |
| `-l, --limit` | top-N size (default 10, **capped at 1000**); `events`/`users` default higher but **cap at 200** |
| `-g, --granularity` | `hour` `day` `week` `month` (timeseries; bounded to **2000 buckets**, over-wide combos are rejected) |
| `--timezone` | IANA tz for bucketing (stats/timeseries) |
| `--include-bots` | include bot-flagged events (excluded by default) |
| `-f, --format` | `table` `json` `csv` |
| `--compact` | single-line JSON (or `LITEMETRICS_COMPACT=1`); default JSON is pretty |
| `--site a,b` | query several sites in one call (JSON keyed by site ID) |

## Agent patterns

```bash
litemetrics metrics | jq -r '.[].metric'
litemetrics overview -p 7d | jq '.visitors.total'
SITE=$(litemetrics sites | jq -r '.sites[0].siteId')
litemetrics stats top_countries --site $SITE -p 30d | jq -r '.data[] | "\(.key)\t\(.value)"'
litemetrics stats top_pages -p 7d --compact | jq '.data | length'   # single-line JSON
```

## Multi-site

`--site a,b` runs the query per site and returns one JSON object keyed by site ID:

```bash
litemetrics overview -p 7d --site site_a,site_b -f json | jq 'keys'   # ["site_a","site_b"]
```

- Single site: output is unchanged (the raw result object).
- Multiple sites: top-level keys are the site IDs; table mode prints one section per site.
- If any site fails, its message lands under an `"errors"` key, successful sites are still emitted, and the exit code is `1`. Prefer `-f json` for multi-site.

## Output contract

- **stdout is data only** (JSON / table / CSV); notes and diagnostics go to **stderr**. No ANSI, spinners, or prose on stdout.
- **Exit codes:** `0` success, `1` any error (including any failed site in a multi-site run).
- **Error envelope** (JSON mode, single line on stderr): `{"error": "...", "status"?: <http>, "suggestions"?: [...]}`.
  - `error` surfaces the server's own message (e.g. `Unauthorized - invalid or missing admin secret`), not the opaque `Request failed with status code 401`.
  - `status` is the HTTP status when the failure came from a response.
  - `suggestions` appears for did-you-mean cases (unknown metric, invalid period/format).
- **Caps are safe:** `top_*` clamps to 1000, `events`/`users` to 200, `timeseries` to 2000 buckets (over-wide combos are rejected, not truncated).

For programmatic access from code, use `@litemetrics/client` (`getStats`, `getTimeSeries`, `getRetention`, `getBotStats`, …) — the CLI is a thin wrapper over it.
