# Litemetrics Mobile App

Native Litemetrics client built with Expo Router and React Native.

It connects to your Litemetrics server, lets you add providers, and shows analytics pages optimized for mobile.

## What It Includes

- Provider onboarding (server URL + admin secret)
- Analytics overview
- Realtime visitors/events
- Insights (behavioral metrics)
- Campaign attribution
- Retention cohorts
- Events explorer
- Users explorer
- Site management (create/update/delete, conversion events)

## Prerequisites

- Bun 1.2+
- Expo-compatible iOS/Android setup
- A running Litemetrics server with:
  - base URL (for example `https://analytics.yoursite.com`)
  - admin secret

## Run Locally

```bash
cd apps/mobile
bun install
bun run start
```

Platform-specific commands:

```bash
bun run ios
bun run android
bun run web
```

Type-check:

```bash
bunx tsc --noEmit
```

## Initial App Flow

1. Open app
2. Add provider (`name`, `baseUrl`, `adminSecret`)
3. Select site
4. Navigate through tabs: Analytics, Events, Users, Settings

## Project Structure

- `app/(auth)` - welcome and provider setup
- `app/(tabs)/(analytics)` - analytics pages
- `app/(tabs)/(events)` - events list and event detail
- `app/(tabs)/(users)` - users list and user detail
- `app/(tabs)/(settings)` - provider + site management
- `src/api` - data hooks and API clients
- `src/stores` - auth/UI state
- `src/components` - shared UI components

## Configuration

Primary config is in `app.config.ts`.

Important fields:

- `ios.bundleIdentifier`
- `android.package`
- `scheme`
- `version`
- `extra.eas.projectId` (required for EAS builds; do not leave as placeholder)

## Security Notes

- Never commit real admin secrets, DB credentials, tokens, or private keys.
- Keep environment-specific values outside tracked files.
- Provider secrets are stored with `expo-secure-store` on device.

## Pre-release Checklist

### Build and metadata

- Confirm app identity values:
  - `ios.bundleIdentifier`
  - `android.package`
  - `scheme`
- Bump `version` in `app.config.ts` for each release.
- If using EAS:
  - Set a real `extra.eas.projectId`
  - Add `eas.json` release profiles
  - Set iOS/Android build numbers (`buildNumber`/`versionCode`)

### Quality checks

- `bunx tsc --noEmit` passes
- Launch and verify core flows on at least one iOS and one Android target
- Verify auth flow: add provider, reconnect after app restart
- Verify analytics pages load for selected site
- Verify pull-to-refresh works on Events, Users, and Settings/Sites
- Verify navigation behavior between analytics sections and back buttons

### Open-source safety

- Confirm no secrets in tracked files:
  - `git grep -nE \"(SECRET|TOKEN|PASSWORD|PRIVATE KEY|API_KEY)\"`
- Keep local `.env` files ignored and environment-specific

## Notes

- The root workspace currently does not include `apps/mobile`; run commands from `apps/mobile`.
