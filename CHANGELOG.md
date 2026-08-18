# Changelog

## Unreleased - App traffic is no longer filtered as browser traffic

Android events from React Native apps were never stored: RN's `fetch` sends OkHttp's default `okhttp/<version>` User-Agent on Android, `isbot` matches any bare `name/version` token, and the signature layer dropped every batch in `standard` mode. Measured across four app sites: 6053 events in 90 days, zero Android.

### `@litemetrics/node` (0.7.0 -> next)

- **App sites run the rate-limit layer only.** On a site with `type: 'app'` the signature and heuristic layers no longer run — both are browser heuristics, and an app SDK sends no browser User-Agent, `Accept-Language` or `Referer`, so on an app site they only ever misfired (the heuristic layer would have flagged 100% of app traffic the moment `strict` was enabled). `standard` therefore drops nothing on an app site; `strict` / `shadow` apply the per-IP rate limit only. Deliberate trade-off: an app site no longer rejects a self-declared crawler User-Agent. Web sites are unchanged.
- **`onSiteTypeMismatch` callback** (`botFilter` config): fired once per site when app SDK payloads (`mobile.platform` set) arrive at a site whose type is not `app`, with `{ siteId, siteType, platform, mode }`. Reporting only — the payload never bypasses the filter, and unknown site ids never enter the once-per-site set. `apps/server` logs it as `[site-type-mismatch] ...`.
- **Operators: a site that receives app SDK traffic must be typed `app`** (`PUT /api/sites/:id {"type":"app"}`), otherwise it is still filtered as browser traffic and keeps losing Android events.

### `@litemetrics/core` (0.6.1 -> next)

- Added `BotFilterConfig.onSiteTypeMismatch` and `SiteTypeMismatchInfo`.

### `@litemetrics/react-native` (0.4.0 -> next)

- **Sends its own User-Agent** — `litemetrics-react-native/<version> (<platform>)` — on every collect request, so the traffic is identifiable on any Litemetrics server, not only one running the node fix above. The parenthetical is load-bearing: `isbot` flags any bare `name/version` token, and a test pins that the header is not bot-shaped on either platform.
- **Android `osVersion` is now the release, not the API level.** `Platform.Version` is the marketing version on iOS (`"17.4"`) but the API level on Android (`34`), so `top_os_versions` was listing `Android 34` next to `iOS 17.4`. Android now reports `Platform.constants.Release` (`"14"`); if that is missing, the API level is sent labelled (`API 34`) rather than bare. **Data note:** events stored before this release keep the API-level values, so `top_os_versions` shows both scales for an Android site until the old rows age out of the query window.
- **`sdkVersion` was wrong** — the constant read `0.2.2` while the package was `0.4.0`, so every event carried a stale `sdkVersion`. It is now read from `package.json` and cannot drift again.

### Dashboard

- Bot Filtering mode hints in site settings describe what each mode actually does on an `app` site (rate limit only).

## 0.7.1 - fix: cli ↔ core version alignment

### `@litemetrics/cli` (0.6.0 -> 0.6.1)

**Fix broken publish.** `cli@0.6.0` imports `FILTER_KEYS` from `@litemetrics/core` but declared `@litemetrics/core@^0.6.0` and shipped a nested `core@0.6.0` — a version that predates that export. A fresh global install (`bun install -g @litemetrics/cli`) therefore crashed on startup with `SyntaxError: The requested module '@litemetrics/core' does not provide an export named 'FILTER_KEYS'`; bumping only the top-level `core` did not help because the CLI resolved its own nested copy. Bumped the dependency to `@litemetrics/core@^0.6.1` (the release that adds `FILTER_KEYS`) so a fresh install pulls a compatible core. No behavior change beyond fixing startup.

## 0.7.0 - Agent-UX Hardening

Hardens the CLI as an AI-agent query surface: strict input validation, hard output caps, transparent errors, compact JSON, and one-call multi-site querying.

### `@litemetrics/cli` (0.5.0 -> 0.6.0)

**Strict input validation:** an out-of-enum `--period` (e.g. `14d`), or `custom` without both `--from`/`--to`, now exits `1` with a `{ error, suggestions }` envelope instead of silently coercing to a default period. Unknown metric names and an invalid `--format` are rejected the same way.

**Output caps:** `top_*` limits clamp to 1000, `events`/`users` to 200; an over-wide `timeseries` (period x granularity beyond 2000 buckets) fails loudly with a coarser-granularity hint rather than returning a giant payload.

**Error transparency:** every error is a single-line `{ "error", "status"?, "suggestions"? }` object on stderr. `error` is the server's real message (`response.data.error`) rather than axios's opaque `Request failed with status code 401`; `status` is the HTTP code; a blank-message network error (e.g. a dual-stack `ECONNREFUSED`) falls back to `err.code` so the envelope is never `{"error":""}`.

**Compact JSON:** `--compact` (or `LITEMETRICS_COMPACT=1`) emits single-line JSON; the default stays pretty-printed (backward compatible).

**Multi-site:** `--site a,b` queries several sites in one call and emits one JSON object keyed by site id (table/csv print one section per site). Partial failures keep the successful sites and collect the rest under an `"errors"` key, exiting `1`. Single-site output is unchanged.

**Output contract for agents:** stdout is data-only; notes and errors go to stderr; exit `0` on success, `1` on any error. Documented in the README's new "Output contract for agents" section.

### `@litemetrics/node` (0.6.0 -> 0.7.0)

- **Top-N cap:** all three adapters (ClickHouse, MongoDB, Postgres) clamp `top_*` limits to 1000 through a shared `capLimit` helper; the existing events/users 200 cap now uses the same single source.
- **Timeseries budget:** `queryTimeSeries` rejects any range x granularity exceeding 2000 buckets with a `QueryValidationError` (HTTP 400) before hitting the database, suggesting a coarser granularity.
- **Error mapping:** null-safe `statusCode` read in the collector's query error path, so a thrown non-object no longer hangs the request.

## 0.4.0 — Timestamp Sanitization

### `@litemetrics/node`

**Data integrity:** The collector now validates client-supplied event timestamps against server time. Events with timestamps outside a configurable window (default: 5 min future, 24 h past) are **dropped** by default, preventing:

- Data corruption from clients with incorrect system clocks
- Timestamp-spoofing analytics poisoning

**New config:** `CollectorConfig.timestampSanity` (see `packages/node/README.md`). Default: `{ futureMs: 5 * 60 * 1000, pastMs: 24 * 60 * 60 * 1000, mode: 'drop' }`.

**Modes:**
- `'drop'` (default) — discard out-of-window / invalid events
- `'clamp'` — replace timestamp with server-now, keep the event
- `'off'` — pass valid client timestamps through; invalid values are still replaced with server-now

**Observability:** New `onOutOfWindow(info)` callback fires whenever the sanitizer rejects a value, exposing `{ reason: 'future' | 'past' | 'invalid', offsetMs, event }` so operators can wire poisoning signals into their metrics.

### `@litemetrics/core`

- New exported types: `TimestampSanityConfig`, `TimestampOutOfWindowInfo`, `TimestampOutOfWindowReason`.
- `CollectorConfig.timestampSanity?: TimestampSanityConfig` field added (optional, non-breaking).

## 0.3.0 — CLI

### `@litemetrics/cli` (new)

- CLI tool for querying analytics data and managing sites from the terminal
- Supports all API endpoints: `overview`, `stats`, `timeseries`, `events`, `users`, `retention`, `sites`
- Output formats: `table` (human-readable), `json` (AI agents), `csv` (export)
- Auto-detects format: JSON when piped, table when interactive
- Config via CLI flags, env vars (`LITEMETRICS_URL`, `LITEMETRICS_ADMIN_SECRET`, `LITEMETRICS_SITE_ID`), or `~/.litemetricsrc`
- All 28 metrics supported including UTM, channels, mobile-specific metrics
- Filtering with `--filter key=value` (geo, device, UTM, event metadata)
- Period comparison with `--compare`
- Install globally: `bun add -g @litemetrics/cli`

## 0.2.0 — Mobile App Support

### Breaking Changes

None. This release is fully backward compatible.

### `@litemetrics/react-native`

**Action required** if you use the React Native SDK:

- **Persistent visitor ID:** `visitorId` is now persisted across app restarts via AsyncStorage. Previously it was regenerated every launch, meaning the same user appeared as a new visitor each time. To enable persistence, install the optional peer dependency:
  ```
  bun add @react-native-async-storage/async-storage
  ```
  Without it, behavior falls back to the previous in-memory mode (no persistence).

- **New config options:** `appVersion` and `appBuild` can now be passed to the tracker. These are sent to the server and appear in dashboard analytics.
  ```tsx
  <LitemetricsProvider siteId="..." endpoint="..." appVersion="1.2.0" appBuild="42">
  ```

- **Rich device context:** The SDK now automatically collects platform, OS version, device model (Android), device brand, screen dimensions, language, and timezone. No code changes needed — this happens transparently.

- **Intl API fallbacks:** Language and timezone detection gracefully falls back to React Native native modules (`SettingsManager` on iOS, `I18nManager` on Android) when Intl APIs are unavailable (JSC engine, older Hermes).

### `@litemetrics/node`

- **Mobile-aware event enrichment:** When an event includes `mobile.platform`, the server now builds device info from client-sent data instead of parsing the User-Agent header. This fixes mobile requests being misidentified as `desktop / Unknown`.

- **New DB columns** are added automatically on server start (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for ClickHouse, schemaless for MongoDB):
  `os_version`, `device_model`, `device_brand`, `app_version`, `app_build`, `sdk_name`, `sdk_version`

- **New query metrics:** `top_os_versions`, `top_device_models`, `top_app_versions`

- **Site type:** Sites now have an optional `type` field (`'web' | 'app'`). Defaults to `'web'` for existing sites.

- **New filter keys:** `device.osVersion`, `device.deviceModel`, `device.deviceBrand`, `device.appVersion`

### `@litemetrics/core`

- Added `MobileContext` interface
- Added `SiteType` type (`'web' | 'app'`)
- Extended `DeviceInfo` with `osVersion`, `deviceModel`, `deviceBrand`, `appVersion`, `appBuild`, `sdkName`, `sdkVersion`
- Added `type?: SiteType` to `Site`, `CreateSiteRequest`, `UpdateSiteRequest`
- Added metrics: `top_os_versions`, `top_device_models`, `top_app_versions`

### `@litemetrics/client`

- Re-exports `SiteType` from core

### `@litemetrics/dashboard`

- Site creation now supports selecting type (Web / App)
- Site selector shows Globe (web) or Smartphone (app) icon
- App sites show mobile-relevant analytics: Screen Views, OS breakdown, OS Versions, Device Models, App Versions
- App sites hide web-only data: Referrers, Browser breakdown, Desktop/Mobile/Tablet device type
- New segment filters: OS Version, Device Model, Device Brand, App Version

### No changes

`@litemetrics/tracker`, `@litemetrics/react`, `@litemetrics/ui`
