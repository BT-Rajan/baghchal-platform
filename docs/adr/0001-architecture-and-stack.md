# ADR 0001: Architecture and stack

- Status: accepted
- Date: 2026-10-16

## Context
We are building a public, real-time multiplayer Bagh Chal platform in the style of chess.com:
accounts, an online lobby, direct challenges, live games with clocks, ratings and
leaderboards, on web, phones and tablets. The previous prototype (a Flask app built as a
hiring-assessment tool) is kept separate and untouched.

## Decision
One repository, three parts:

| Part | Technology | Why |
|---|---|---|
| `engine/` | Pure Python, no dependencies | Single source of truth for the rules, shared by the server, workers and tooling. Bit-board representation for speed; exhaustively tested. |
| `server/` | Python 3.12+, FastAPI, native WebSockets, Pydantic, SQLAlchemy 2 + Alembic, MySQL / MariaDB (SQLite for development), Redis, arq workers | Async I/O suits many idle WebSocket connections; the relational database is the system of record and stays swappable (ADR 0003); Redis carries presence, cross-instance fan-out and leaderboards; CPU-heavy AI search runs in worker processes, never in request handlers. |
| `app/` | TypeScript, Expo / React Native, React Native Web, SVG board | One codebase for iOS, Android, tablets and the browser. |

Principles:
- **Server-authoritative.** Clients send intents; the server validates every move with the
  engine and owns the clocks. Clients only render what the server says.
- **Typed wire protocol.** Every WebSocket and HTTP message has a schema validated on both ends.
- **Stateless app servers.** Any instance can serve any user; all shared state is in the
  database or Redis, so the service scales horizontally.

## Performance note
Python is not a bottleneck for move validation (tens of thousands of checked moves per
second per core) or for WebSocket fan-out at this scale. The one CPU-heavy part is AI search;
it runs in separate worker processes and can move to a native extension if profiling shows
the need.
