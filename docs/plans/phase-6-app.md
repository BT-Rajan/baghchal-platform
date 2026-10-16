# Phase 6 plan: the app

Status: in progress, on branch `phase-6-app`.

One Expo / React Native client for web, iOS, Android and tablets, in `app/`. It talks only
to our own server (Phases 2–5). Per [ADR 0002](../adr/0002-no-dependency-on-expo-cloud.md),
it never depends on Expo's cloud.

## Goals
- A player can sign up, verify their email, sign in, find players, challenge them, play a
  live game with clocks, follow a rated two-game match, and browse profiles and leaderboards.
- The same code runs on web, phones and tablets.
- The server stays the authority. The app never decides legality, clocks or results; it
  shows what the server says and sends intentions.
- It is held to the server's quality bar: strict types, lint, tests with enforced coverage on
  the logic, and a CI job.

## Stack
| Concern | Choice | Why |
|---|---|---|
| Framework | Expo SDK 58, React Native 0.88, React 19.3 | One codebase for web, iOS and Android; MIT |
| Language | TypeScript 6, `strict` | |
| Navigation | Expo Router (file-based) | Real URLs on web, so email links like `/verify-email?token=…` open the right screen |
| Server state | TanStack Query | Caching, retries and refetch-on-focus; realtime events write into the same cache |
| Board drawing | `react-native-svg` for lines; pieces as pressable views | Crisp at any size; every point is a real button with an accessibility label |
| Token storage (native) | `expo-secure-store` (Keychain / Keystore) | |
| Tests | Jest (`jest-expo`) and React Native Testing Library | |
| Lint and format | ESLint (`eslint-config-expo`), Prettier | |
| API types | Generated from the server's OpenAPI schema (`openapi-typescript`) | The client and server cannot drift silently |

Not used: EAS Build, EAS Update, Expo Push, `expo-updates`, analytics SDKs.
Packages are installed at the versions pinned in `expo/bundledNativeModules.json`.

## Layout
```
app/
  app.config.ts          name, scheme, API URL (EXPO_PUBLIC_API_URL); no EAS project ID
  src/
    app/                 routes (Expo Router)
      _layout.tsx        providers; signed-in / signed-out route guards
      sign-in.tsx  sign-up.tsx  forgot-password.tsx
      verify-email.tsx  reset-password.tsx      targets of links in emails
      (tabs)/            Play (lobby), Leaderboard, Me
      game/[id].tsx      live board
      player/[username].tsx
    api/                 generated schema types, fetch client, typed endpoints, errors
    auth/                session context, token store (native only)
    realtime/            WebSocket client, events into the query cache
    game/                BFEN parsing, board geometry, move input, clocks (pure logic)
    components/          Board, Clock, buttons, fields, player rows, challenge cards
    theme.ts
  tests/                 (or colocated *.test.ts)
```

## Authentication
- **Web** signs in with `transport: "cookie"`. The session is an `HttpOnly` cookie that page
  scripts cannot read; requests use `credentials: "include"`. The server's CORS and
  cross-site checks already allow only configured origins.
- **Native** signs in with `transport: "bearer"`. The token goes into SecureStore and is sent
  as `Authorization: Bearer …` on HTTP and on the WebSocket handshake.
- On start the app calls `GET /api/v1/me` to decide whether a session exists. Any
  `401 not_authenticated` (or WebSocket close `4401`) clears the token and returns to sign-in.
- Sign-out calls `POST /auth/logout`, then clears local state and the query cache.
- Passwords are never stored or logged. Form errors show the server's per-field messages.

## Talking to the server
- **HTTP client**: one `fetch` wrapper that sets a base URL, JSON, credentials or bearer
  token, and a timeout (`AbortSignal`). It turns the server's
  `{"error": {"code", "message", "fields"}}` into a typed `ApiError`, so screens branch on
  `code` (`player_busy`, `stale_position`, `not_your_turn`, …) and never on text.
- **Realtime**: one WebSocket per app or tab (`/api/v1/ws`, see
  [realtime.md](../realtime.md)):
  - Reconnects with exponential backoff and jitter. Pings every 25 s.
  - Close codes: `4401` signs out. `1003`, `1009`, `4408` and `4429` reconnect after backoff.
  - `challenge` events upsert into the challenges cache. Challenges that are no longer pending
    leave the lists.
  - `game` events go into that game's cache entry, only if they are newer. Newer means a
    higher `ply`; at the same ply, finished beats active, then the later `server_time`. Resigning
    does not change `ply`, so "highest ply" alone is not enough.
  - When a new game of mine starts (a challenge accepted, or game 2 of a match), the app opens
    it.
  - After a reconnect the app refetches challenges and active games, since events missed
    while offline are not replayed.

## Screens
- **Sign up / sign in / forgot password / reset password / verify email**: all public. The
  verify and reset screens read `?token=` from the URL the email links to
  (`public_base_url/verify-email`, `/reset-password`).
- **Play (lobby)**:
  - A banner to resume my live game.
  - Incoming challenges (accept / decline, with an expiry countdown) and outgoing ones
    (cancel).
  - Online players, and search by username prefix.
  - "Challenge" opens a form: time control (3+2, 5+3, 10+5, 15+10), rated or casual, and a side
    for casual games.
- **Game**:
  - The board, both players with ratings, both clocks, the move list, and the match score with
    a link to the other game.
  - Resign (with confirmation). Abort before both sides have moved. Claim the win when the
    opponent has been offline on their turn; the server decides whether the claim succeeds.
  - Result banner with rating changes.
- **Player profile**: online/playing status, blitz and rapid ratings (a "?" while
  provisional, leaderboard rank), and a Challenge button.
- **Leaderboard**: Blitz and Rapid tabs.
- **Me**: my profile and sign out.

Layouts adapt by width. On tablets and desktop the board sits beside the side panel; on
phones it sits above it. The board is square and as large as fits.

## Playing a move
- The board comes from the BFEN `position`. Selectable pieces and target points come only
  from the server's `legal_moves`, so the app needs no rules engine:
  - While goats are being placed, tap an empty highlighted point.
  - Otherwise, tap a piece, then a highlighted destination (a step or a capture). Tapping
    another of my pieces changes the selection; tapping elsewhere clears it.
- The move is sent as `{ply, move}`, and the response replaces the cached game. The board
  waits for the server and is never ahead of it.
  - `409 stale_position` refetches.
  - `409 not_your_turn` or `game_over` refetches and shows the result.
- **Clocks** count down locally from `clocks` as of `server_time`, corrected for the
  difference between server and device time. The server alone decides time-outs.

## Security
- No secrets in the bundle. The only configuration is the public API URL.
- Web: tokens are never in JS-readable storage. Native: SecureStore only.
- The deep-link scheme handles only known routes. Tokens from links are sent to the server
  and never stored.
- Untrusted input: WebSocket messages are parsed defensively (unknown types are ignored,
  and malformed JSON never crashes the app). Usernames are rendered as text, never as
  markup.
- Guardrail script in CI: it fails if app config or source mentions `u.expo.dev`,
  `exp.host`, an EAS `projectId`, `expo-updates` or `getExpoPushTokenAsync`.
  `EXPO_NO_TELEMETRY=1` is set in CI.

## Testing
- **Unit**: BFEN parsing, board geometry, move-input state machine, clock maths,
  "newer game" ordering, error mapping, realtime reconnect and backoff, and event-to-cache
  wiring. 100% coverage is enforced on `src/game`, `src/api`, `src/realtime` and `src/auth`.
- **Components**: board taps produce the right move; lobby challenge flow; sign-in form
  errors.
- **Contract**: CI regenerates the OpenAPI schema from the server and the TypeScript types
  from it, and fails if the committed copies differ.
- **End to end (local smoke)**: the web build against a real server, with two browsers
  (Playwright, Chromium) that sign up, challenge, accept and play to a result.

## CI (new `app` job)
`npm ci` → guardrails → OpenAPI/type sync check → `tsc --noEmit` → ESLint → Prettier check →
Jest with coverage thresholds → `expo export --platform web` (the production bundle builds).

## Out of scope for Phase 6 (later phases)
- Native release pipeline (prebuild, fastlane, signing) and our own update server: Phase 8.
- Push notifications through FCM / APNs: Phase 8.
- Computer opponent, game archive and replay, fair-play checks: Phase 7.
- Universal links / App Links (so email links open the native app): Phase 8. Until then,
  email links open the web app.

## Delivery steps
1. Scaffold `app/`: config, lint, format, typecheck, Jest, CI job, guardrails.
2. OpenAPI export from the server, generated types, sync check.
3. API client, errors, session and auth screens.
4. Realtime client and cache wiring.
5. Lobby, profiles, leaderboard.
6. Board, move input, clocks, game screen, matches.
7. Responsive layout, accessibility pass, empty and error states.
8. Docs (README, app README), local end-to-end smoke, PR.
