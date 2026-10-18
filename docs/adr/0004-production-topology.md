# ADR 0004: Production topology and operations

- Status: accepted
- Date: 2026-10-17

## Context
The platform needs to run for real players: on one machine to start, with room to add API
servers, and with enough visibility to know when it breaks. A load test (200 players on
MariaDB and Redis) found two failures that only appear under concurrency, which shaped some of
the decisions below.

## Decision
- **One origin.** Caddy serves the web app and proxies `/api` (HTTP and WebSocket) to the API
  replicas on the same domain, with certificates from Let's Encrypt. The session cookie stays
  first-party (`__Host-`, `SameSite=Lax`) and no CORS is needed in production. Caddy does not
  serve `/health` or `/metrics` to the internet.
- **Stateless API replicas** behind Caddy (least busy first, skipping replicas that fail
  readiness). Everything shared lives in MariaDB (the record) or Redis (presence, rate limits,
  live events, the sweeper lease); Redis holds nothing that must survive a restart.
- **One sweeper at a time.** With Redis, the replica holding a 3-second lease (taken or renewed
  by an atomic script) ends games that run out of time, so the database load from sweeping
  does not grow with replicas. The conditional update in `expire` still guarantees a game ends
  once if two replicas overlap.
- **READ COMMITTED on MySQL / MariaDB.** Under InnoDB's default REPEATABLE READ, an `UPDATE`
  that matches no row still locks the index gap, and concurrent challenge creation deadlocked.
  Correctness never relied on snapshot reads: work that must happen once uses unique keys and
  conditional updates (ADR 0003), which hold at either level.
- **A Redis pool that waits.** Each process has a bounded, blocking connection pool (default
  100, waiting up to 5 s), owned by the client so shutdown closes every connection, instead of
  failing commands when a burst exhausts the pool.
- **Migrations never copy `users` on SQLite.** A batch copy drops the old table, and with
  foreign keys on, that deletes rows in every table that cascades from it (games, sessions…).
  Columns are added and dropped with plain `ADD/DROP COLUMN`; migrations stay additive so the
  previous release keeps working while they run.
- **Observability without lock-in.** Prometheus metrics behind a bearer token, labelled by
  route template; optional Sentry-protocol error reports with no personal data; alert rules
  kept in the repository with unit tests.
- **Backups as plain dumps.** Nightly consistent `mariadb-dump` files, verified before they
  get their final name, with a restore script and a rehearsed procedure; copying them off the
  machine is part of the runbook.

## Consequences
A single machine runs everything with `docker compose`; growing means more API replicas first
(about one per 150 concurrent games, measured), then a bigger or separate database. Moving to
Kubernetes or a managed database changes the deployment files, not the application. The
runbook is [`docs/operations.md`](../operations.md).
