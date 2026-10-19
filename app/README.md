# ClawPlay app

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

## Brand

ClawPlay's mark is three tiger claw slashes on an amber badge; the wordmark is "Claw" in ink and
"Play" in amber. Both are drawn in code (`src/components/brand/Logo.tsx`), so they stay sharp at
any size. `assets/brand/clawplay-mark.svg` is the same mark as a file, and the app icon, the
Android adaptive icon and the favicon in `assets/` are made from it. Brand colours live in
`src/theme.ts` (`brand*`). Bagh Chal remains the name of the game; ClawPlay is the platform.

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

- **The visual system.** `src/theme.ts` holds the tokens: colours by role (`accent` only for
  a screen's main action, `ink` for what is selected or current, `link`, success, danger), a
  type scale, radii and a soft shadow. The shared components draw everything with them: chips
  for choices (`Segmented`), lifted cards, neutral secondary buttons, one line-icon set
  (`Icon`, also on `IconButton` for utility toggles like sound). Wide screens get a sidebar
  instead of the bottom tab bar. The game shows whose move it is on the player's bar, and the
  goats to place and the tigers' captures as a coin tray and five slots (`PieceCounts`).
- **The front door.** Signed-out visitors land on `/welcome`: what Bagh Chal is, how it's
  played, and "Play now, no sign-up", which signs them in as a guest (`guest-3fa9c1`) and
  starts their first game at once: goats, against the Easy computer, at 15+10.
  Guests play the computer and casual games; rated play, challenges, reports and payments ask
  for an account. A banner on Play and Me leads to `/claim`, which turns the guest into a real
  account and keeps its games.
- **The server decides.** The app sends intentions (a move as `{ply, move}`, a challenge, a
  resignation) and shows what the server answers. Selectable pieces and targets come only from
  the server's `legal_moves`; there is no rules engine in the app.
- **Sessions.** The web uses the server's HttpOnly cookie, which scripts cannot read. Apps ask
  for a bearer token and keep it in the Keychain / Keystore (`expo-secure-store`). On start the
  app asks `GET /me`; any `401 not_authenticated` signs out, ignoring late answers that belong
  to an earlier session.
- **Settings.** Me → Settings is the one place for settings: the plan, board and sounds, blocked
  players, moderation (staff) and signing out; for members it also changes the email address (confirmed by a link sent
  to the new one) or password, downloads your data (a file on the web, the share sheet in
  apps) and deletes the account.
- **Notifications.** The bell in the bar above the tabs counts unread notifications and opens
  `/notifications`: challenges, friend requests and acceptances, tournaments starting, each
  leading to the player or the tournament. Opening the list reads it; a `notification` event
  updates the count.
- **Friends.** A player's profile has the friend button (add, cancel, accept or decline,
  remove after `Confirm`). Home shows friend requests to answer, and the friends themselves,
  online first, above "Online now", each with a Challenge button. A `friends` event on the
  socket refreshes them. Guests have no friends.
- **Home.** The Play tab is a dashboard: a live game to continue first, challenges, "Play
  now", today's puzzle (`DailyPuzzle`, on the same `PuzzleBoard` as the trainer), the latest
  three results (`GameHistory` as a preview, with the rest on Me), and beside them the players
  online. "More ways to play" is here, and only here: challenges by link, tournaments and the
  trainer, each a `FeatureLink` tile carrying the plan's badge when the player's plan lacks it.
  The daily puzzle shows the player's daily streak.
- **Play now.** The lobby's "Play now" opens a screen to pair with whoever wants the same game
  (casual or rated, with a live count of who is waiting; leaving the screen stops waiting) or
  to play the computer at a chosen strength and side.
- **The coach.** Games against the Easy computer show a tip for the moment (`src/game/coach.ts`:
  placing and moving goats, captures on offer, a goat just lost, what to try after the game)
  and mark the goats in danger, which the server sends as `goats_in_danger`. Choosing Easy is
  choosing tips, so there is no separate setting.
- **The game screen.** Leaving a live game of mine asks first (`usePreventRemove` with the
  shared `Confirm`, also used to resign and to block). Once a game ends, the next step comes
  straight after the result: a rematch or "Play the computer again", and back to the lobby.
  In a finished game each move in the list is a button that shows the position after it.
- **History and replay.** Profiles list the player's finished games, newest first and paged;
  each opens the game, where finished games step through every position. A game against the
  computer offers "Play the computer again" (sides swapped) instead of a rematch or report.
- **Leaderboard.** The top three on a podium, the rest below, and a line saying where I stand
  (my rank, or why I am not listed yet), from my own profile.
- **Plans.** Settings → Your plan shows Free, Plus or Pro and leads to the plans. Paid features are
  shown with what unlocks them (Hard in the computer picker, the 30-day history note) rather
  than hidden. The plans page shows each plan's price (with the yearly saving) and a table
  of what each includes, built from the server's plans (`comparisonRows`). Admins grant and
  revoke plans and features on a player's moderation page.
- **Analysis.** A finished game has an Analysis section: "Analyse this game" (Plus and Pro;
  Free sees what Plus adds), then the verdict on the move being replayed with the engine's
  choice, "Next mistake", each side's tally, and ?!, ? and ?? marks in the move list.
- **Payments.** The plans page has "Buy a month" and "Buy a year" for Plus and Pro when the
  server takes payments. Razorpay's Checkout script is loaded on the first purchase
  (`src/payments/razorpay.ts`) and opens Razorpay's own window; the app never sees card
  details, and the server confirms the payment before the plan changes. Web only for now.
- **Challenges by link.** Play now → "Challenge a friend by link" (`/invite`) uses the same
  `ChallengeForm` as challenging a player by name, without the rated choice; the link it makes
  (`shareLink` in `src/lobby/format.ts`, the one way the app makes share links) opens `/c/[code]`,
  where the friend's "Accept and play" starts the game. The challenge also shows under Your
  challenges in the lobby, with its link and a Cancel button.
- **Pro extras.** Play now → More ways to play: tournaments (host, join by link, standings, "Play
  now" on my games) and the trainer (the puzzle on the real board, in the player's theme).
  Players without Pro see what each does in the one `Upsell` component, as everywhere a
  paid feature is locked.
- **Board, pieces and sounds.** Settings → Board, pieces and sounds: board themes and piece sets
  (drawn by `Wood.tsx` and `Coin.tsx` from `src/appearance/catalog.ts`), sound packs (made live
  in `sound.ts`), game sounds on or off, and showing or hiding the badge. Free sees the choices
  it would get with Plus. These are one setting, kept on the server for every device: the
  game's "Turn sounds off" button changes the same `sounds_on`.
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
  in, the lobby, challenges, live events, playing, clocks, results, matches, blocking, account settings, reports and moderation,
  play now, the computer, history and replay.
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
- A dark theme (the app declares itself light-only until then).
- Testing on real iOS and Android devices.
