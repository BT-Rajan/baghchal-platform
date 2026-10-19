# ClawPlay

<img src="app/assets/brand/clawplay-mark-512.png" alt="ClawPlay" width="96" align="right">

ClawPlay is real-time multiplayer Bagh Chal (बाघचाल): sign in, see who is online, challenge anyone or play
whoever is waiting, play the computer, replay finished games, play live with clocks, and climb
rated leaderboards — on web, phones and tablets. Players can block
and report others, moderators can suspend and rename, and players can change, export or delete
their accounts.

## Repository layout
| Path | What | Status |
|---|---|---|
| `engine/` | Pure-Python rules engine and computer player (no dependencies) | Phases 1, 7 ✅ |
| `server/` | FastAPI backend: accounts, lobby, live games, ratings, computer games, moderation, metrics | Phases 2–5, 7, 8 ✅ |
| `app/` | Expo / React Native client for web, iOS, Android ([README](app/README.md)) | Phases 6, 7 ✅ |
| `docs/` | Rules canon, architecture decision records, [operations runbook](docs/operations.md) | |
| `deploy/` | Production stack: Compose, Caddy, backups, Prometheus alerts | |
| `tools/` | The load test (`tools/loadtest.py`) | |

Start with [`docs/rules.md`](docs/rules.md), [`docs/realtime.md`](docs/realtime.md) and
[`docs/adr/`](docs/adr/). Running it in production (deployment, monitoring, backups, capacity):
[`docs/operations.md`](docs/operations.md).

## Roadmap
Each phase ships complete — tested, documented and reviewed — before the next begins.

1. **Rules engine** ✅ — traditional rules (goats first, no repeated positions, no draws);
   bit-board move generation, game records, notation, symmetries;
   verified against an independent reference implementation, perft and property tests.
2. **Server foundation** ✅ — FastAPI, SQLAlchemy + Alembic on MySQL / MariaDB / SQLite,
   accounts (argon2id, email verification, sessions, password reset), rate limiting,
   CSRF and size guards, structured logging, health checks, Docker.
3. **Lobby** ✅ — WebSocket gateway, presence across servers, player search, challenges.
4. **Live play** ✅ — authoritative games, server clocks, reconnection, resignation, aborts
   and abandonment.
5. **Ratings** ✅ — Glicko-2 per time control, side-swapped rated matches, leaderboards.
6. **App** ✅ — Expo client for web, iOS and Android: sign-up, lobby and challenges, live
   games with clocks, rated matches, profiles and leaderboards; no Expo-cloud dependency.
7. **More to play** ✅ — a computer opponent at three strengths (easy, medium, hard; casual
   games only, searched in worker processes), quick pairing (play whoever is waiting for the
   same game; rated pairings are side-swapped matches), and game history on every profile with
   move-by-move replay, and automatic fair-play checks: every rated game is reviewed in the
   background, and players whose games play as only an engine does are reported to the
   moderators (never penalised automatically; [plan and calibration](docs/plans/phase-7-fair-play.md)).
   The Easy computer coaches newcomers: a tip for each moment of the game, and goats in danger
   marked on the board; "Play now" on the welcome page starts that game at once.
8. **Ready for players** — what a public service needs:
   - ✅ **Accounts**: change the email address or password, download your data, delete the
     account ([API](#api-v1)).
   - ✅ **Moderation**: reports, a moderator role, suspensions, bans and renames, with a
     moderation log ([rules](docs/rules.md#reports-and-moderation)).
   - ✅ **Operations**: production stack (Caddy, API replicas, MariaDB, Redis), metrics, error
     reports, alerts, nightly backups with a rehearsed restore, and a load test with measured
     capacity ([runbook](docs/operations.md)).
   - ✅ **Fair play**: abort penalties, blocking, lag compensation, one rated match per pair a
     day.
   - ✅ **Security review** of the whole platform, with the fixes it called for
     ([`SECURITY.md`](SECURITY.md)).
   - ✅ **Privacy policy and terms**, for India (DPDP Act 2023, IT Rules) and players worldwide
     (GDPR): versioned texts every player agrees to (and agrees again when they change), a
     month and year of birth at sign-up (13 and over; under 18, a parent or guardian agrees by
     email before the player meets other people), and data deleted on the policy's schedule
     ([plan](docs/plans/phase-8-ready-for-players.md)).
   - Still to do: store builds for the apps, and testing on real devices.
9. **Plans** — Free, Plus and Pro ([below](#plans)):
   - ✅ Plans, features, admin grants (a plan or one feature, for a while or for good) and the
     Hard computer and full history behind Plus.
   - ✅ **Post-game analysis**: the engine reviews every move of a finished game (best, good,
     inaccuracy, mistake, blunder, with its own choice), 5 new games a day on Plus.
   - ✅ **Themes, sound packs and badges**: five boards, four piece sets and four sound packs
     (the first of each free), and a Plus or Pro badge by the player's name.
   - ✅ **Payments with Razorpay**: Plus and Pro for a month or a year, confirmed by signature and
     webhook.
   - ✅ **Pro extras**: small round-robin tournaments among friends, and an opening and
     endgame puzzle trainer. (Inviting a friend by link is a free challenge, for everyone, and
     so is the trainer's daily puzzle.)
   - ✅ **Friends**: a request and an answer, then friends on the home screen with their
     presence and a Challenge button.
   - ✅ **Notifications**: a bell with what happened while you were away (challenges, friend
     requests, tournaments starting), each leading to where it happened.
   - ✅ **Quick messages**: five set phrases in any game against a person, rated included,
     which either player can hide (`emotes_on`, with the other appearance settings).
   - ✅ **Achievements**: nine milestones on every profile (first win, each side, trapping the
     tigers, five captures, the Medium and Hard computer, ten rated games, a 7-day puzzle
     streak), worked out from games and daily puzzles.
   - Perhaps later: **private tables** for Pro, an extension of challenges by link (a table
     that stays open for a series of games with the same friends).

## Development
Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
uv sync                                       # .venv with every package and dev tool
uv run pytest engine                          # engine tests
uv run pytest server                          # server tests (SQLite by default)
uv run ruff check . && uv run ruff format --check .
(cd engine && uv run mypy --config-file ../pyproject.toml .)
(cd server && uv run mypy --config-file ../pyproject.toml .)
uv run mypy --config-file pyproject.toml tools
uv run python engine/benchmarks/bench.py      # engine throughput
```

Run the server locally:

```bash
cd server
uv run alembic upgrade head                   # creates ./baghchal.db (SQLite)
uv run uvicorn baghchal_server.asgi:app --reload
# API docs: http://127.0.0.1:8000/docs  — emails are printed to the console in development
```

Or the full stack (MySQL, Redis, API) with Docker: `docker compose up --build`.

The app (Node 22): see [`app/README.md`](app/README.md).

```bash
cd app
npm ci
npm run web                                   # http://localhost:8081, against the local server
npm run typecheck && npm run lint && npm test
npm run e2e:smoke                             # two browsers play a game against a real server
```

Server tests against MySQL / MariaDB and Redis:

```bash
BAGHCHAL_TEST_DATABASE_URL=mysql+asyncmy://user:pass@localhost/baghchal_test \
BAGHCHAL_TEST_REDIS_URL=redis://localhost:6379/15 uv run pytest server
```

Settings are read from `BAGHCHAL_*` environment variables; see [`.env.example`](.env.example).
Production refuses to start with unsafe settings.

Load test (many players playing real games against a running server; test deployments only,
since it creates accounts directly in the database): see
[`docs/operations.md`](docs/operations.md#scaling) and `tools/loadtest.py`.

CI runs the engine on Python 3.12 and 3.13, and the server on SQLite plus MySQL 8.4 and
MariaDB 11.4, with Redis; both packages must keep 100% branch coverage. The app job checks the
Expo-cloud guardrail, API type sync, types, lint, formatting and tests (100% coverage on its
logic), and builds the web app. The deploy job checks the production files: the backup
scripts (shellcheck), the alert rules and their unit tests (promtool), the Prometheus config
and the Caddyfile.

## API (v1)
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/auth/guest` | Play at once without signing up: a guest account, signed in (`transport`, `birth_month`, `terms_version`, `privacy_version`); a guest under 18 plays only the computer |
| POST | `/api/v1/me/claim` | A guest makes a real account (`username`, `email`, `password`, and the agreement as for sign-up), keeping their games; the email works once its link is opened |
| POST | `/api/v1/auth/register` | Start sign-up (`username`, `email`, `password`, `birth_month` as `YYYY-MM`, `terms_version`, `privacy_version`, and under 18 `parent_email`); emails a confirmation link (always 202) |
| GET | `/api/v1/legal`, `/api/v1/legal/{terms\|privacy}` | The current versions; a document's text (Markdown) |
| POST | `/api/v1/me/consents` | Agree to the current versions (and give the `birth_month`, for an account made before it was asked); `GET /me` says what is needed (`consents_needed`, `age_needed`) |
| POST | `/api/v1/parent-consent/look-up`, `/api/v1/parent-consent` | From the email to a parent: whose account it is; `decision` agree (the player may play people) or refuse (the account is deleted). The same link withdraws until the player turns 18 |
| POST | `/api/v1/auth/verify-email` | Confirm the address and sign in |
| POST | `/api/v1/auth/login` | Sign in with username or email |
| POST | `/api/v1/auth/logout` | End this session |
| POST | `/api/v1/auth/password-reset` | Email a reset link (always 202) |
| POST | `/api/v1/auth/password-reset/confirm` | Set a new password; signs out everywhere |
| GET | `/api/v1/me` | The signed-in account |
| POST | `/api/v1/me/password` | Change the password (needs the current one); signs out other devices |
| POST | `/api/v1/me/email`, `/api/v1/auth/confirm-email` | Change the email address; it changes once the link sent to the new address is opened |
| GET | `/api/v1/me/export` | Download everything the server keeps about you, as JSON |
| POST | `/api/v1/me/delete` | Delete the account (needs the password; not during a live game) |
| GET | `/api/v1/players?prefix=al` | Find players by username prefix (with online status) |
| GET | `/api/v1/players/online` | Players online now |
| GET | `/api/v1/players/{username}` | A player's profile, with ratings and leaderboard rank |
| GET | `/api/v1/blocks` | Players you have blocked |
| PUT, DELETE | `/api/v1/blocks/{username}` | Block or unblock a player (see [rules](docs/rules.md#live-play-platform-rules)); a block ends any friendship |
| GET | `/api/v1/players/{username}/achievements` | A player's achievements: every one, with when it was earned (worked out from their games and daily puzzles, never stored) |
| GET | `/api/v1/notifications` | My latest notifications (challenges, friend requests and acceptances, tournaments starting), newest first, and the unread count |
| POST | `/api/v1/notifications/read` | Mark them all read |
| GET | `/api/v1/friends` | My friends (online first) and the friend requests waiting on either side |
| POST, DELETE | `/api/v1/friends/{username}` | Ask a player to be friends (or accept their request); unfriend, decline or cancel. Members only; the other player gets a `friends` event |
| POST | `/api/v1/players/{username}/report` | Report a player to the moderators (`reason`, `details`, optional `game_id`) |
| GET | `/api/v1/players/{username}/games?before=&limit=` | A player's finished games, newest first (page back with `before` = the last `finished_at`) |
| GET | `/api/v1/seeks` | How many players are waiting, per time control and rated or casual |
| POST, DELETE | `/api/v1/seeks` | Play whoever is waiting for the same game (`time_control`, `rated`): starts the game at once, or waits up to two minutes; `DELETE` stops waiting |
| GET | `/api/v1/challenges` | Your open challenges, incoming and outgoing |
| POST | `/api/v1/challenges` | Challenge an online player (`opponent`; `time_control` 2+1, 3+2, 5+3 or `sand` (the sand clock); `rated`; `side`), or, with no `opponent`, make a casual challenge by link (its `code`, open for a day) |
| GET | `/api/v1/challenges/link/{code}` | A challenge by link, for whoever has the link |
| POST | `/api/v1/challenges/link/{code}/accept` | Accept a challenge by link (guests too); the game starts now if the challenger is online |
| POST | `/api/v1/challenges/{id}/accept`, `/decline`, `/cancel` | Answer or withdraw a challenge; accepting starts the game |
| GET | `/api/v1/games` | Your live games (to resume after a reconnect) |
| POST | `/api/v1/games/{id}/emote` | A quick message to my opponent (`emote`: good_luck, good_move, oops, thanks, well_played), during the game or up to 5 minutes after; not against the computer. They get an `emote` event unless they turned quick messages off |
| POST | `/api/v1/games/computer` | Play the computer (`level` easy, medium or hard; `side`; `time_control`); never rated |
| GET | `/api/v1/games/{id}` | A game: position, moves, legal moves, goats in danger (on the goats' turn), clocks, result; finished games add every position, for replay |
| POST | `/api/v1/games/{id}/moves` | Play `{"ply": n, "move": "a1-b2"}` (`ply` = moves you have seen) |
| POST | `/api/v1/games/{id}/resign`, `/abort`, `/claim-abandonment` | End the game (see [rules](docs/rules.md#live-play-platform-rules)) |
| GET, POST | `/api/v1/games/{id}/analysis` | Plus and Pro: a finished game's analysis; `POST` works it out if nobody has yet (counts against today's allowance) |
| GET | `/api/v1/me/payments` | Whether payments are taken, and my payments |
| POST | `/api/v1/payments/checkout` | Start buying a `plan` (plus, pro) for a `period` (month, year): a Razorpay order |
| POST | `/api/v1/payments/verify` | Confirm a payment with what Razorpay Checkout returned (`order_id`, `payment_id`, `signature`) |
| POST | `/api/v1/payments/webhook` | Razorpay's webhook (`payment.captured`, `order.paid`, `payment.failed`), checked by its signature |
| GET, POST | `/api/v1/tournaments` | Tournaments I am in; host one (Pro: `name`, `time_control`, `max_players` 3–6) |
| GET | `/api/v1/tournaments/{code}` | A tournament: players, standings and every pairing |
| POST | `/api/v1/tournaments/{code}/join`, `/leave`, `/start`, `/finish` | Join or leave while open; the host starts it or ends it |
| POST | `/api/v1/tournaments/{code}/pairings/{id}/play` | Start one of my tournament games (my opponent must be online) |
| GET | `/api/v1/trainer?kind=opening\|endgame` | Pro: my next puzzle and progress |
| GET | `/api/v1/trainer/daily` | Today's puzzle (the same for everyone, on every plan), my first answer to it, and my daily streak |
| POST | `/api/v1/trainer/{id}/answer` | Answer a puzzle with a `move`; says whether it was best, and which was (Pro, except today's puzzle) |
| GET, PATCH | `/api/v1/me/appearance` | My `board`, `pieces` and `sounds` (beyond the first of each: Plus and Pro), `sounds_on` and `show_badge`; a change sends only what changes |
| GET | `/api/v1/plans` | Free, Plus and Pro: features and prices |
| GET | `/api/v1/me/plan` | My plan, my features, and the grants behind them |
| GET | `/api/v1/admin/players/{username}/plan` | Admins: a player's plan and every grant |
| POST | `/api/v1/admin/players/{username}/grants` | Admins: grant a `plan` or a `feature` for `days` (`null`: until revoked), with a `reason` |
| POST | `/api/v1/admin/grants/{id}/revoke` | Admins: end a grant now, with a `reason` |
| GET | `/api/v1/leaderboards/{blitz\|rapid\|sand}` | Top established players (the app calls these Quick, Standard and Sand clock) |
| GET | `/api/v1/mod/reports?status=open` | Moderators: the report queue (or closed reports) |
| POST | `/api/v1/mod/reports/{id}/dismiss` | Moderators: close a report without acting |
| GET | `/api/v1/mod/players/{username}` | Moderators: a player's standing, reports and moderation log |
| POST | `/api/v1/mod/players/{username}/suspend`, `/unsuspend`, `/rename` | Moderators: suspend (`days`, or `null` to ban), lift a suspension, or rename; each needs a `reason` |
| WS | `/api/v1/ws` | Live events — see [`docs/realtime.md`](docs/realtime.md) |
| GET | `/health/live`, `/health/ready` | Liveness; readiness (database, Redis) |
| GET | `/metrics` | Prometheus metrics; only with `BAGHCHAL_METRICS_TOKEN` set and sent as a bearer token |

Browsers authenticate with an HttpOnly session cookie; native apps pass
`"transport": "bearer"` when signing in and send `Authorization: Bearer <token>`.

### Moderation
Moderators are made from the server's command line, never through the API (so a stolen
session cannot promote itself). It uses the same `BAGHCHAL_*` settings as the server:

```bash
cd server
uv run python -m baghchal_server.moderators grant alice     # moderator; or: revoke alice, list
uv run python -m baghchal_server.moderators admin alice     # admin: moderates, and grants plans
```

Every moderator action is logged with its reason, and moderators cannot act on themselves or
on other moderators. Automatic fair-play reports arrive in the same queue with no reporter
(`"reporter": null`); `GET /api/v1/mod/players/{username}/fair-play` shows the figures behind
them, game by game. To refuse usernames containing certain words (ignoring case, digits,
`_` and `-`), set `BAGHCHAL_BLOCKED_USERNAME_WORDS='["word1", "word2"]'`; moderators can rename
anything the list misses.

### Plans
Free, Plus and Pro, each a set of **features** (`server/src/baghchal_server/billing/plans.py`).
Code checks features, never plans, so admins can give a single feature as well as a whole plan.
Nothing paid changes who wins a rated game: live play, rated matches and quick pairing are free
for everyone.

| | Free | Plus (₹149/month, ₹1,490/year) | Pro (₹299/month, ₹2,990/year) |
|---|---|---|---|
| Live and rated games, quick pairing | ✅ | ✅ | ✅ |
| The computer | Easy, Medium | + Hard | + Hard |
| History and replay | Last 30 days | Everything | Everything |
| Post-game analysis | — | 5 new games a day | Unlimited |
| Board and piece themes, sound packs, badge | — | ✅ | ✅ |
| Hosting tournaments, the trainer | — | — | ✅ |

A player's features are their plan's plus whatever admins have **granted**. Admins grant a plan
or one feature for 7, 30, 90 or 365 days or until revoked, always with a reason; the player is
emailed, and grants and revocations go in the player's moderation log. Admins do this on a
player's moderation page in the app, or through `/api/v1/admin/…`.

**Post-game analysis** (`engine/src/baghchal_engine/review.py`): for each move of a finished
game, the engine searches every legal move (depth 3, up to 0.25 s a position, in the computer
players' worker processes) and compares the played move with its best. The loss, in the
evaluation's units (1,000 is a goat), gives the verdict: best, good (≤ 60), inaccuracy (≤ 200),
mistake (≤ 700) or blunder. A game is analysed once and kept; anyone with the feature can read it without using
their allowance. Plus has 5 new analyses a day (UTC); Pro, or the feature granted on its own,
has no limit. Live games are never analysed.

**Themes, sound packs and badges** (`server/src/baghchal_server/appearance/`): boards (Wood,
Walnut, Slate, Jade, Midnight), piece sets (Classic, Bronze and pearl, Porcelain, Gold and
silver) and sound packs (Gentle, Woodblock, Temple bells, Arcade), the first of each free. The
choice is kept on the server, so it follows the player to every device; if their plan lapses
they see the free set meanwhile, and their choice comes back when it is renewed. Players with
the badge feature show PLUS or PRO by their name (in games, on profiles, the leaderboard and
the players online), unless they hide it.

**Payments** (`server/src/baghchal_server/payments/`): players buy Plus or Pro for a month (30
days) or a year (365 days) with [Razorpay Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/):
cards, UPI, net banking and wallets. Plans are paid in advance and never renew by themselves;
buying again adds on to the time already held. The server creates an order for the price, the
browser takes the payment in Razorpay's window, and the plan is given when the server has
checked Razorpay's signature: from the browser, or from the webhook if the browser never comes
back. Each order is given once. A paid period is an ordinary grant, marked as paid, so it shows
in the player's grant history; the player is emailed a receipt. Payment records are kept when
an account is deleted.

To take payments:

1. In the Razorpay Dashboard, create API keys (Account & Settings → API Keys; test mode first,
   `rzp_test_…`).
2. Add a webhook (Account & Settings → Webhooks) to `https://<your site>/api/v1/payments/webhook`
   with the events `payment.captured`, `order.paid` and `payment.failed`, and a secret.
3. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` in
   `bhagchal2.env` (or `BAGHCHAL_RAZORPAY_…` elsewhere) and restart. Until they are set, the
   plans page says paying online is coming soon.
4. Try a payment with Razorpay's test cards, then switch to live keys.

**Challenges by link** (`lobby/`, free): a challenge with no opponent named, sent as a link to
a friend who may not be on ClawPlay yet. It is casual, with the challenger's time control and
side; whoever opens it first, signed in or as a guest, plays the challenger, who must be online.
It is open for a day, or until accepted or cancelled, and counts towards the challenger's open
challenges. It replaced the Pro private rooms.

**Pro extras.** Only the host needs Pro; anyone can join.

- **Tournaments** (`tournaments/`): a round robin for 3 to 6 players, joined by link. Once the
  host starts it, each player plays each other twice, once with each side, in casual games
  (ratings cannot be farmed). Either player starts a pairing whenever the other is online; an
  aborted game can be played again. A point per win; it ends when every game is played, or
  when the host ends it.
- **Trainer** (`trainer/`): 120 puzzles, half openings (goats still being placed) and half
  endgames, each a position from the computer's games where one move beats every other by at
  least a mistake's worth (`server/scripts/make_puzzles.py`, fixed by its seed). Answers are
  checked on the server, so solutions never reach the browser; progress and streaks are kept.
  One puzzle a day, picked by the date and the same for everyone, is free on every plan: the
  daily puzzle on the home screen, with a streak of the days in a row it was solved (first
  answer right).
