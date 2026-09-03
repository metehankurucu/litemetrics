# Changelog

## 0.9.0 - Ad click IDs, link click identity, one event per labelled click

**Ad click IDs are captured at landing and stored as first-class columns.** A click ID (`gclid`, `gbraid`, `wbraid`, `fbclid`) not recorded at click time cannot be backfilled later; server-side conversion upload APIs key on them and do not accept UTM values as a substitute.

### `@litemetrics/core` (0.6.2 -> 0.6.3)

- New `AdsParams` type on `ClientContext.ads`; new `STORAGE_KEY_ADS` and `CLICK_ID_TTL` constants.

### `@litemetrics/tracker` (0.5.0 -> 0.6.0)

- Ad click IDs are parsed from the landing URL, merged across landings (a retargeting click carrying one platform's ID does not erase the other's), and kept for **90 days** (`CLICK_ID_TTL`) so conversion events on later pages — and later sessions — still carry them. `reset()` drops them.
- Meta's `_fbp` cookie is **read (never set) and forwarded only when a click ID was captured** — a visitor who never clicked an ad sends no cookie value, and the daily visitor-ID rotation stays unbridged for everyone else.
- **One click on a labelled element now produces one event.** A click on (or inside) an element carrying a non-empty `data-litemetrics-event` is recorded only as the declared event; the auto `Link Click` / `Outbound Link` / `File Download` / `Button Click` rows are suppressed for it. Previously both fired, double-counting exactly the elements site authors had labelled — and the pair shared no key, so the duplication was unrepairable server-side. **Upgrading integrators will see auto click rows disappear for labelled elements** (they were duplicates); an *empty* label (`data-litemetrics-event=""`) counts as unlabelled and keeps today's auto capture. Rage-click and scroll events are unaffected.
- **Auto-captured link clicks now carry element identity.** `Link Click`, `Outbound Link` and `File Download` events include `elementSelector` and `elementText` (same helpers, on the anchor element, that button clicks already used). An anchor with no visible text (icon links) keeps `elementText` absent. A button wrapped in an anchor is attributed to the link branch with the anchor's identity.
- **Outbound link rows now carry the full destination.** For `Outbound Link` events, `targetUrlPath` is `host + path + query` instead of the bare pathname — previously `wa.me/1555…` stored only `/1555…` and `api.whatsapp.com/send?phone=…` stored only `/send`, discarding exactly what identifies the destination. Internal links (including `tel:` / `mailto:`, which already carry their payload in the path) are unchanged. **Data note:** `top_link_targets` keys for outbound clicks become host-qualified from this release; older rows keep the bare-path shape.

### `@litemetrics/node` (0.8.0 -> 0.9.0)

- New nullable event columns `gclid`, `gbraid`, `wbraid`, `fbclid`, `fbp` in all three adapters.
- **Operators:** existing ClickHouse/Postgres deployments migrate automatically at collector startup (idempotent `ADD COLUMN IF NOT EXISTS` in `init()`); no manual SQL.
- `scripts/migrate-clickhouse-to-postgres.ts` and `scripts/backup-clickhouse.ts` now `DESCRIBE` the source table and project `NULL` for columns it does not have yet, instead of failing with `UNKNOWN_IDENTIFIER` against a pre-upgrade ClickHouse source. The backup's column list is now built from `EVENT_BASE_COLUMNS` (it had drifted and was silently omitting `bot_flag`).
- **Data note:** Postgres INSERT batches are now 1300 rows (48 columns/row under the 65,535 bind-parameter cap).

### `@litemetrics/react` (0.5.0 -> 0.6.0)

- No source change. Requires `@litemetrics/tracker@^0.6.0` so the provider ships with the link-click identity fields and the labelled-click dedupe; `^0.5.0` cannot resolve `tracker@0.6.0`.

## 0.8.0 - App traffic unfiltered, collect observability, tracker hard stop

**App traffic is no longer filtered as browser traffic.** Android events from React Native apps were never stored: RN's `fetch` sends OkHttp's default `okhttp/<version>` User-Agent on Android, `isbot` matches any bare `name/version` token, and the signature layer dropped every batch in `standard` mode. Measured across four app sites: 6053 events in 90 days, zero Android.

### `@litemetrics/node` (0.7.0 -> 0.8.0)

- **App sites run the rate-limit layer only.** On a site with `type: 'app'` the signature and heuristic layers no longer run — both are browser heuristics, and an app SDK sends no browser User-Agent, `Accept-Language` or `Referer`, so on an app site they only ever misfired (the heuristic layer would have flagged 100% of app traffic the moment `strict` was enabled). `standard` therefore drops nothing on an app site; `strict` / `shadow` apply the per-IP rate limit only. Deliberate trade-off: an app site no longer rejects a self-declared crawler User-Agent. Web sites are unchanged.
- **`onSiteTypeMismatch` callback** (`botFilter` config): fired once per site when app SDK payloads (`mobile.platform` set) arrive at a site whose type is not `app`, with `{ siteId, siteType, platform, mode }`. Reporting only — the payload never bypasses the filter, and unknown site ids never enter the once-per-site set. `apps/server` logs it as `[site-type-mismatch] ...`.
- **Operators: a site that receives app SDK traffic must be typed `app`** (`PUT /api/sites/:id {"type":"app"}`), otherwise it is still filtered as browser traffic and keeps losing Android events.

### `@litemetrics/core` (0.6.1 -> 0.6.2)

- Added `BotFilterConfig.onSiteTypeMismatch` and `SiteTypeMismatchInfo`.

### `@litemetrics/react-native` (0.4.0 -> 0.5.0)

- **Sends its own User-Agent** — `litemetrics-react-native/<version> (<platform>)` — on every collect request, so the traffic is identifiable on any Litemetrics server, not only one running the node fix above. The parenthetical is load-bearing: `isbot` flags any bare `name/version` token, and a test pins that the header is not bot-shaped on either platform.
- **Android `osVersion` is now the release, not the API level.** `Platform.Version` is the marketing version on iOS (`"17.4"`) but the API level on Android (`34`), so `top_os_versions` was listing `Android 34` next to `iOS 17.4`. Android now reports `Platform.constants.Release` (`"14"`); if that is missing, the API level is sent labelled (`API 34`) rather than bare. **Data note:** events stored before this release keep the API-level values, so `top_os_versions` shows both scales for an Android site until the old rows age out of the query window.
- **`sdkVersion` was wrong** — the constant read `0.2.2` while the package was `0.4.0`, so every event carried a stale `sdkVersion`. It is now read from `package.json` and cannot drift again.

### Dashboard

- Bot Filtering mode hints in site settings describe what each mode actually does on an `app` site (rate limit only).

### `@litemetrics/tracker` (0.4.0 -> 0.5.0)

**`destroy()` is now a hard stop.** It still flushes whatever is already queued, then refuses everything afterwards: `send()` and `flush()` become no-ops, and a `fetch` that rejects after teardown no longer retries through `sendBeacon`. Previously `destroy()` only cleared the flush interval, so a send whose visitor id was still resolving fired a request *after* teardown, for example after `@litemetrics/react` unmounts its provider.

**Trade-off:** an event tracked in the moments before `destroy()`, whose visitor id has not resolved yet, is now dropped rather than delivered late. For an analytics SDK a request escaping a torn-down instance is worse than a lost data point, and `destroy()` stays synchronous.

**Listener cleanup.** `destroy()` unregisters the `visibilitychange` and `pagehide` handlers it registered. Before this, every `createTracker` leaked two listeners for the lifetime of the page, so an SPA that mounts a provider per route grew listeners without bound.

**Visitor id resolved at construction.** Previously it was computed on the first `track()`, and until that hash landed a send sat pending, which is precisely the window `destroy()` now drops. Doing it up front narrows the window to the moments right after page load.

### `@litemetrics/react` (0.4.0 -> 0.5.0)

**Fixes a silent provider under React StrictMode.** `LitemetricsProvider` destroys its tracker on unmount but kept the instance in a ref, and StrictMode remounts the same component in development, so the remounted provider handed every consumer a destroyed tracker. Combined with the hard stop above, that meant the app reported its first pageview and then went silent, with no error anywhere.

The context now carries a stable facade that resolves the tracker on each call rather than capturing one, so a remount rebuilds it. A genuine unmount is tracked separately, so a stale `useLitemetrics()` handle cannot revive tracking after the provider is gone. `useLitemetrics()` still returns a usable object on the first render: this is not a breaking change.

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

## 0.6.0 - Layered bot filter, command palette, event deletion

**Bot traffic is filtered in three layers and excluded from every query by default.** The previous filter was a hardcoded list of user-agent substrings: it missed everything that did not self-identify, and it had no way to report what it had caught.

### `@litemetrics/node` (0.5.0 -> 0.6.0)

- **Three-layer bot filtering.** Layer 1 matches the maintained [`isbot`](https://github.com/omrilotan/isbot) list of known crawlers, replacing the hardcoded patterns. Layer 2 (`isHeuristicBot`) catches scrubbed or empty user agents. Layer 3 is a per-IP sliding-window rate limiter with O(1) LRU eviction that stops growing a client's timestamp array once it is already over the limit. The mode is overridable per site.
- **`botFlag` is persisted** across the ClickHouse, MongoDB and Postgres adapters (a new column and index in each), alongside per-site `botFilterMode` — so filtered traffic can be reported instead of silently discarded. New `queryBotStats()` backs the dashboard's view of it.
- **`DELETE /api/users/:id/events`**, admin-secret gated, backed by a new `deleteUserEvents()` method on all three adapters.
- The hostname allowlist now runs **before** the bot pipeline. A deployment receiving bot floods on disallowed origins was draining the per-IP rate limit and starting to flag legitimate users behind a shared NAT.
- A malformed percent-encoded visitor id returns 400 instead of 500; the heuristic layer builds its `UAParser` per call rather than sharing a module-level singleton; `BOT_RATE_MAX`, `BOT_RATE_WINDOW_MS` and `PORT` fall back to their defaults with a warning when set to nonsense.

### `@litemetrics/core` (0.5.0 -> 0.6.0)

- New `BotFilterMode` (`off` / `standard` / `strict` / `shadow`), `BotFilterConfig` and `BotDetectedInfo` types; `CollectorConfig.botFilter`; `EnrichedEvent.botFlag`; `Site.botFilterMode`; `includeBots?` on every query-params type; `deleteUserEvents()` and `queryBotStats()` on the `DBAdapter` contract.

### `@litemetrics/tracker` (0.3.1 -> 0.4.0)

- Short-circuits to a no-op tracker when `navigator.webdriver === true`, so Selenium / Puppeteer / Playwright never reach the collector.

### `@litemetrics/client` (0.3.1 -> 0.4.0)

- `includeBots` option on stats, retention, events, time-series and users requests, so a consumer can opt into seeing bot-flagged events rather than always having them excluded.
- New `getBotStats()`, returning `{ total, bySignature, byHeuristic, byRateLimit }`.

### `@litemetrics/cli`, `@litemetrics/react`, `@litemetrics/react-native`, `@litemetrics/ui` (0.3.1 -> 0.4.0)

- Dependency-only releases, tracking the core / client / tracker bumps above.

### Dashboard

- Cmd+K command palette for switching and creating sites, replacing the sidebar site dropdown; the sidebar's "Sites" entry became "Settings". Per-site bot filter mode toggle, an "include bots" query toggle, a bot-stats card on the overview, and a delete-all-events action on the user detail page.

### Landing

- Rewritten as SSG (`vite-react-ssg`) with nine pre-rendered SEO pages, per-page JSON-LD, and a build-time guard that fails the build when a route is missing from the sitemap. Motivated by 90 days of data showing 54 pageviews and zero Google referrals: the pre-React HTML was an empty div.

## 0.5.0 - Postgres adapter, referrer normalization

### `@litemetrics/node` (0.4.0 -> 0.5.0)

- **Postgres adapter with full ClickHouse parity.** A complete `DBAdapter` implementation - every metric type, retention cohorts, channel classification, timezone-aware time series, `jsonb` properties and traits, BRIN + BTREE indexes - so a deployment can run on cheap managed Postgres (Railway, RDS) instead of ClickHouse Cloud. Covered by an integration suite and a ClickHouse-to-Postgres parity suite.
- **Migration and backup tooling:** `scripts/migrate-clickhouse-to-postgres.ts` (idempotent, keyset-paginated, configurable `--overlap-minutes`, UTC-safe datetime parsing) and `scripts/backup-clickhouse.ts` (streaming JSONL dump).
- **Referrer normalization.** `top_referrers` used to split one source across rows that differed only by scheme, `www.`, `m.` or a trailing slash: `https://www.tiktok.com/` and `https://www.tiktok.com` were two separate rows. Referrers are normalized to a bare hostname at ingest, and the same expression is applied inside the ClickHouse and MongoDB adapters so existing rows collapse without a backfill. The referrer filter uses that expression too, so a drilldown matches old and new rows alike.

### `@litemetrics/core` (0.4.0 -> 0.5.0)

- `DBConfig.adapter` widened to include `'postgres'`.

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

## 0.3.1 - fix: publish-safe dependency ranges

Every package declared its `@litemetrics/*` dependencies as `workspace:*` - a Bun/pnpm workspace protocol that an npm consumer installing the published tarball cannot resolve. The packages published as `0.3.0` therefore could not install their own siblings outside the monorepo. Replaced with real caret ranges and republished. No behavior change; this is the same class of publish bug as `0.7.1`.

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

## 0.1.3 - Initial tagged release

Predates this changelog. Covers the first published packages: the tracker, the collector with its ClickHouse adapter, the query API, the dashboard UI, and Mixpanel-style identity merging across visitor sessions. Written up retroactively so the tag list and this file line up.
