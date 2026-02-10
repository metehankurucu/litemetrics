# Changelog

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
