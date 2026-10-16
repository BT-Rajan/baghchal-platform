# Bagh Chal Platform

Real-time multiplayer Bagh Chal (बाघचाल): sign in, see who is online, challenge anyone, play
live with clocks, and climb rated leaderboards — on web, phones and tablets.

## Repository layout
| Path | What | Status |
|---|---|---|
| `engine/` | Pure-Python rules engine (no dependencies) | Phase 1 ✅ |
| `server/` | FastAPI backend: accounts, lobby, live games, ratings | Planned |
| `app/` | Expo / React Native client for web, iOS, Android | Planned |
| `docs/` | Rules canon and architecture decision records | |

Start with [`docs/rules.md`](docs/rules.md) and [`docs/adr/`](docs/adr/).

## Roadmap
Each phase ships complete — tested, documented and reviewed — before the next begins.

1. **Rules engine** ✅ — bit-board move generation, game records, notation, symmetries;
   verified against an independent reference implementation, perft and property tests.
2. **Server foundation** — FastAPI, PostgreSQL + Alembic, accounts (argon2id, email
   verification, sessions), rate limiting, structured logging, health checks, Docker Compose.
3. **Lobby** — WebSocket gateway, presence, player search, challenges.
4. **Live play** — authoritative games, server clocks, reconnection, resign / draw /
   abandonment.
5. **Ratings** — Glicko-2 per time control, side-swapped rated matches, leaderboards.
6. **App** — Expo client: lobby, board, profile, leaderboard; no Expo-cloud dependency.
7. **More to play** — computer opponent, game archive and replay, fair-play checks.
8. **Production hardening** — load tests, security review, backups, deployment.

## Development
Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
uv sync                                  # create .venv with all dev tools
uv run pytest engine                     # tests
uv run ruff check . && uv run ruff format --check .
uv run mypy engine                       # strict type checking
uv run python engine/benchmarks/bench.py # throughput
```

CI runs the same checks with more property-test examples (`HYPOTHESIS_PROFILE=ci`) and
requires 100% branch coverage of the engine.
