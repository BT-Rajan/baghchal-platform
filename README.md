# Bagh Chal Platform

Real-time multiplayer Bagh Chal (बाघचाल): sign in, see who is online, challenge anyone, play
live with clocks, and climb rated leaderboards — on web, phones and tablets.

## Repository layout
| Path | What | Status |
|---|---|---|
| `engine/` | Pure-Python rules engine (no dependencies) | Phase 1 ✅ |
| `server/` | FastAPI backend: accounts, lobby, live games, ratings | Phases 2–5 ✅ |
| `app/` | Expo / React Native client for web, iOS, Android ([README](app/README.md)) | Phase 6 ✅ |
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
7. **More to play** — computer opponent, game archive and replay, fair-play checks.
8. **Production hardening** — load tests, security review, backups, deployment, monitoring
   (in place: see [`docs/operations.md`](docs/operations.md)); store builds and push
   notifications for the apps still to come.

## Development
Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
uv sync                                       # .venv with every package and dev tool
uv run pytest engine                          # engine tests
uv run pytest server                          # server tests (SQLite by default)
uv run ruff check . && uv run ruff format --check .
(cd engine && uv run mypy --config-file ../pyproject.toml .)
(cd server && uv run mypy --config-file ../pyproject.toml .)
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

CI runs the engine on Python 3.12 and 3.13, and the server on SQLite plus MySQL 8.4 and
MariaDB 11.4; both packages must keep 100% branch coverage. The app job checks the Expo-cloud
guardrail, API type sync, types, lint, formatting and tests (100% coverage on its logic), and
builds the web app.

## API (v1)
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/auth/register` | Start sign-up; emails a confirmation link (always 202) |
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
| PUT, DELETE | `/api/v1/blocks/{username}` | Block or unblock a player (see [rules](docs/rules.md#live-play-platform-rules)) |
| POST | `/api/v1/players/{username}/report` | Report a player to the moderators (`reason`, `details`, optional `game_id`) |
| GET | `/api/v1/challenges` | Your open challenges, incoming and outgoing |
| POST | `/api/v1/challenges` | Challenge an online player (`time_control` 3+2, 5+3, 10+5, 15+10; `rated`; `side`) |
| POST | `/api/v1/challenges/{id}/accept`, `/decline`, `/cancel` | Answer or withdraw a challenge; accepting starts the game |
| GET | `/api/v1/games` | Your live games (to resume after a reconnect) |
| GET | `/api/v1/games/{id}` | A game: position, moves, legal moves, clocks, result |
| POST | `/api/v1/games/{id}/moves` | Play `{"ply": n, "move": "a1-b2"}` (`ply` = moves you have seen) |
| POST | `/api/v1/games/{id}/resign`, `/abort`, `/claim-abandonment` | End the game (see [rules](docs/rules.md#live-play-platform-rules)) |
| GET | `/api/v1/leaderboards/{blitz\|rapid}` | Top established players |
| GET | `/api/v1/mod/reports?status=open` | Moderators: the report queue (or closed reports) |
| POST | `/api/v1/mod/reports/{id}/dismiss` | Moderators: close a report without acting |
| GET | `/api/v1/mod/players/{username}` | Moderators: a player's standing, reports and moderation log |
| POST | `/api/v1/mod/players/{username}/suspend`, `/unsuspend`, `/rename` | Moderators: suspend (`days`, or `null` to ban), lift a suspension, or rename; each needs a `reason` |
| WS | `/api/v1/ws` | Live events — see [`docs/realtime.md`](docs/realtime.md) |
| GET | `/health/live`, `/health/ready` | Liveness; readiness (database, Redis) |

Browsers authenticate with an HttpOnly session cookie; native apps pass
`"transport": "bearer"` when signing in and send `Authorization: Bearer <token>`.

### Moderation
Moderators are made from the server's command line, never through the API (so a stolen
session cannot promote itself). It uses the same `BAGHCHAL_*` settings as the server:

```bash
cd server
uv run python -m baghchal_server.moderators grant alice     # or: revoke alice, list
```

Every moderator action is logged with its reason, and moderators cannot act on themselves or
on other moderators. To refuse usernames containing certain words (ignoring case, digits,
`_` and `-`), set `BAGHCHAL_BLOCKED_USERNAME_WORDS='["word1", "word2"]'`; moderators can rename
anything the list misses.
