# Bagh Chal app

The Expo / React Native client for web, iOS, Android and tablets. It talks only to our own
server (`../server`) and never to Expo's cloud ([ADR 0002](../docs/adr/0002-no-dependency-on-expo-cloud.md)).
The design and its reasons are in [the Phase 6 plan](../docs/plans/phase-6-app.md).

## Running it

Requires Node 22 and a running server (see the [root README](../README.md#development)).

```bash
npm ci
npm run web                     # http://localhost:8081, against http://localhost:8000
```

The only setting is the API's address, read at build time:
`EXPO_PUBLIC_API_URL=https://api.example.com npm run export:web`. For the web build, the server
must list the app's origin in `BAGHCHAL_ALLOWED_ORIGINS` and use it as `BAGHCHAL_PUBLIC_BASE_URL`
(the links in emails open the app there).

Release builds must use `https` for the API (plain `http` is allowed only to this machine):
`expo export` fails otherwise, and a release bundle refuses to start. Development builds may use
plain `http`, so a phone can reach a server on your network.

On a phone or simulator, use a development build made on your own machine:
`npx expo run:ios` or `npx expo run:android` (no EAS). Point it at your computer's address, not
`localhost`: `EXPO_PUBLIC_API_URL=http://192.168.1.20:8000`.

## Commands

| Command                                      | What it does                                    |
| -------------------------------------------- | ----------------------------------------------- |
| `npm run typecheck`                          | TypeScript, strict                              |
| `npm run lint` / `npm run format:check`      | ESLint (no warnings allowed) and Prettier       |
| `npm test` / `npm run test:ci`               | Jest; `test:ci` enforces coverage               |
| `npm run guardrails`                         | Fails on anything that would reach Expo's cloud |
| `npm run api:generate` / `npm run api:check` | Regenerate or check `src/api/schema.d.ts`       |
| `npm run export:web`                         | The production web build, in `dist/`            |
| `npm run e2e:smoke`                          | The end-to-end smoke test (below)               |

After changing the server's API: `(cd ../server && uv run python -m baghchal_server.openapi ../app/src/api/openapi.json)`,
then `npm run api:generate`. CI fails if either file is stale.

## Layout

```
src/
  app/          screens (Expo Router: each file is a route)
    _layout.tsx   providers, signed-in / signed-out route guards, error boundary
    (tabs)/       Play (the lobby), Leaderboard, Me
    game/[id].tsx  player/[username].tsx  challenge/[username].tsx  account.tsx
    report/[username].tsx  moderation/ (the report queue and a player's record)
    sign-in, sign-up, forgot-password, verify-email, reset-password, confirm-email
  api/          HTTP client, errors, typed endpoints, generated schema types, query keys
  auth/         the session (SessionStore), token storage, form checks
  realtime/     the WebSocket connection, message parsing, events into the query cache
  game/         BFEN, board geometry, tap-to-move, clocks, server clock, wording, layout
  lobby/        lobby wording and data hooks
  components/   shared UI; components/game/ has the board, player bars and actions
tests/          screen tests (the whole app against a fake server and socket) and helpers
e2e/            the end-to-end smoke test
scripts/        the Expo-cloud guardrail
```

## How it works

- **The server decides.** The app sends intentions (a move as `{ply, move}`, a challenge, a
  resignation) and shows what the server answers. Selectable pieces and targets come only from
  the server's `legal_moves`; there is no rules engine in the app.
- **Sessions.** The web uses the server's HttpOnly cookie, which scripts cannot read. Apps ask
  for a bearer token and keep it in the Keychain / Keystore (`expo-secure-store`). On start the
  app asks `GET /me`; any `401 not_authenticated` signs out, ignoring late answers that belong
  to an earlier session.
- **Your account.** Me → Account settings changes the email address (confirmed by a link sent
  to the new one) or password, downloads your data (a file on the web, the share sheet in
  apps) and deletes the account.
- **Reports and moderation.** "Report" on a profile or a finished game sends a report (with
  the game). Moderators see Me → Moderation: the report queue and each player's record, where
  they suspend, ban, lift a suspension, rename and dismiss reports, always with a reason.
- **Errors.** Every failure becomes an `ApiError` with the server's `code`; screens branch on
  the code, never on the message.
- **Live updates.** One WebSocket per app or tab. It reconnects with jittered backoff, pings
  every 25 s, signs out on close code 4401, and after a reconnect fetches again what it may
  have missed. Events write into the same TanStack Query cache the screens read; a game state
  replaces the cached one only if it is newer (higher ply; at equal ply finished beats active,
  then the later `server_time`).
- **In the background**, apps close their connection (so they stop showing as online) and
  reconnect as soon as they return; browser tabs stay connected.
- **Claiming a win** is offered after a countdown, once the opponent has been offline on their
  turn for a minute; the server checks the same rule.
- **Lag.** The app answers the server's `probe` messages at once, so the server can measure
  the connection and not charge its delay to the player's clock.
- **Clocks.** Countdowns (game clocks, first moves, challenges) run on an estimate of the
  server's clock built from the timestamps it sends, so a wrong device clock does not matter.
  The server alone decides when time is up.

## Tests

- **Unit tests** sit next to the code (`*.test.ts`). `src/api`, `src/auth`, `src/realtime`,
  `src/game` and `src/lobby` must stay at 100% coverage.
- **Screen tests** in `tests/` render the real routes against a fake server
  (`tests/support/fakeServer.ts`) and a fake socket (`tests/support/fakeSocket.ts`): signing
  in, the lobby, challenges, live events, playing, clocks, results, matches, blocking, account settings, reports and moderation.
- **End-to-end smoke** (`npm run e2e:smoke`) runs locally, not in CI. It starts the real server
  on a throwaway SQLite database, builds and serves the web app, and drives two Chromium
  browsers: Alice and Bob sign up, open their emailed links, Alice challenges Bob, Bob accepts,
  and they play the game to a result by clicking the board. Moves follow fixed rules, so every
  run plays the same game. Needs `uv` and Chromium for Playwright (`npx playwright install
chromium` once, or set `E2E_CHROMIUM` to a Chromium binary); see the script for its options.

## Not yet

- Store builds, signing and over-the-air updates from our own server; push notifications
  through FCM / APNs; universal links (email links open the web app for now).
- Privacy policy and terms pages (the app stores require them).
- Playing the computer, quick pairing, game history and replay (Phase 7).
- A dark theme (the app declares itself light-only until then).
- Testing on real iOS and Android devices.
