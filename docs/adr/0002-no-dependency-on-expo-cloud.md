# ADR 0002: No dependency on Expo's cloud services (EAS)

- Status: accepted
- Date: 2026-10-16

## Context
The Expo SDK is MIT-licensed and free at any scale. Expo's hosted services (EAS Build,
EAS Update, Expo Push, EAS Hosting) are billed, and EAS Update is capped by monthly active
users per plan. We do not want user growth to be limited or billed by a third party.

## Decision
The app must never talk to Expo's servers at runtime, and builds must not require them.

| Need | Instead of | We use |
|---|---|---|
| Native builds | EAS Build | `npx expo prebuild` + Gradle / Xcode (fastlane) in GitHub Actions |
| Over-the-air updates | EAS Update (`u.expo.dev`) | Store releases first; later our own server implementing the open Expo Updates protocol |
| Push notifications | Expo Push (`exp.host`) | `getDevicePushTokenAsync()` and sending through FCM / APNs from our backend |
| Web hosting | EAS Hosting | Static export served from our CDN |

Guardrails (in place since Phase 6, `app/scripts/guard-no-expo-cloud.mjs`):
- CI fails if the app config or source references `u.expo.dev`, `exp.host`, an EAS project
  ID, or `getExpoPushTokenAsync`.
- `EXPO_NO_TELEMETRY=1` and `EXPO_OFFLINE=1` in CI.
- `expo-updates`, `eas-cli` and `expo-insights` may not be dependencies.

## Consequences
We run a little more infrastructure ourselves (build pipeline, optional update server). The
only unavoidable third-party fees are Apple's and Google's developer accounts.
