# Bagh Chal app

One Expo / React Native client for web, iOS, Android and tablets. It talks only to our server
(`../server`) and never to Expo's cloud ([ADR 0002](../docs/adr/0002-no-dependency-on-expo-cloud.md)).
The plan behind it is in [docs/plans/phase-6-app.md](../docs/plans/phase-6-app.md).

## Run it

Requires Node.js 22.13+.

```bash
npm ci
npm run web          # http://localhost:8081, talks to the API at http://localhost:8000
npm run android      # or: npm run ios (needs Xcode); uses a local development build
```

Start the server first (see the root README). In development the server allows the
`http://localhost:8081` origin and prints emails, including verification links, to its console.

| Setting               | Where                  | Default                 |
| --------------------- | ---------------------- | ----------------------- |
| `EXPO_PUBLIC_API_URL` | build-time environment | `http://localhost:8000` |

The API URL is baked into the bundle and is public. Production builds refuse anything but https,
except `localhost` for local testing. The server must list the web app's origin in
`BAGHCHAL_ALLOWED_ORIGINS`.

## Checks

```bash
npm run check        # guard, typecheck, lint, format check, tests with coverage
npm run export:web   # production web bundle in dist/
npm run gen:api      # regenerate src/api/schema.ts after the server's API changes
```

`src/api/openapi.json` is the server's schema, written by
`uv run python -m baghchal_server.openapi` (from `server/`). CI regenerates it and the
TypeScript types and fails if either differs from what is committed.

Coverage is enforced: 100% for `src/api`, `src/auth`, `src/game` and `src/realtime` (the logic),
and a floor for screens and components. Screens are tested by rendering the real router
(`expo-router/testing-library`) against a fake API.

## How it fits together

| Path              | What                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `src/app/`        | Screens, one file per route (Expo Router). Signed-in routes sit behind `Stack.Protected`.           |
| `src/api/`        | Typed HTTP client, error mapping, generated types                                                   |
| `src/auth/`       | Session state; tokens in SecureStore on apps, an HttpOnly cookie on the web                         |
| `src/realtime/`   | WebSocket client (backoff with jitter, heartbeats, close codes) and how its events update the cache |
| `src/game/`       | BFEN parsing, board geometry, move input from the server's legal moves, clocks                      |
| `src/components/` | Board, player bars, lobby pieces, UI primitives                                                     |
| `src/hooks/`      | TanStack Query hooks                                                                                |

The server is the authority: the app has no rules engine and never shows a move the server
has not accepted. Clocks count down locally from the server's last snapshot, corrected for the
difference between the device's and the server's clocks.

## Native builds without EAS

`npx expo prebuild` generates `ios/` and `android/` (not committed), then build with Gradle or
Xcode as for any React Native app. The release pipeline (signing, fastlane, store upload) and
push notifications through FCM and APNs come in Phase 8.
