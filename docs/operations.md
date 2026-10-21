# Operations

How to run Bagh Chal in production, watch it, back it up and restore it. Everything here is in
`deploy/`; the reasons behind the setup are in [ADR 0004](adr/0004-production-topology.md).

## What runs

| Service | What it does | Scale |
|---|---|---|
| `web` | Caddy: HTTPS (Let's Encrypt), the web app's static files, and `/api` to the API replicas | 1 |
| `api` | The FastAPI server (`Dockerfile`), stateless; WebSockets included | `API_REPLICAS` (2) |
| `migrate` | Runs `alembic upgrade head` before the API starts, then exits | one-shot |
| `db` | MariaDB 11.4 (MySQL 8.4 works too) | 1 |
| `redis` | Presence, rate limits, live events between replicas, the sweeper lease | 1, no persistence |
| `backup` | A compressed database dump every night, kept `BACKUP_KEEP_DAYS` days | 1 |
| `prometheus`, `alertmanager` | Metrics and alerts (`--profile monitoring`) | optional |

The web app and the API share one origin (`https://DOMAIN`, with the API under `/api`), so
the session cookie is first-party and needs no CORS.

## First deployment

1. A machine with Docker Compose v2, and DNS for your domain pointing at it (ports 80 and 443
   open).
2. Settings:
   ```bash
   cp deploy/.env.example deploy/.env           # fill in every value; never commit it
   openssl rand -base64 32                      # for each password and the metrics token
   printf %s "$METRICS_TOKEN" > deploy/monitoring/metrics-token   # same token, for Prometheus
   ```
   Mail must come from a provider with SPF and DKIM set up for the sending domain, or the
   sign-up links land in spam.
3. Start:
   ```bash
   docker compose -f deploy/compose.prod.yaml --env-file deploy/.env up -d --build
   docker compose -f deploy/compose.prod.yaml --env-file deploy/.env --profile monitoring up -d
   ```
4. Make yourself a moderator (see the README's "Moderation"):
   ```bash
   docker compose -f deploy/compose.prod.yaml --env-file deploy/.env run --rm migrate \
     python -m baghchal_server.moderators grant YOUR_USERNAME
   ```
5. Fill in a real receiver in `deploy/monitoring/alertmanager.yml` and restart it, then check
   that alerts arrive (stop one API replica for five minutes: `BaghchalReplicaDown`).

The server refuses to start in production with unsafe settings (SQLite, no Redis, no SMTP,
non-https addresses) or without the operator's details the privacy policy and terms quote
(`OPERATOR_NAME` … `EMAIL_PROVIDER`), and says which. Have a lawyer read both texts
(`server/src/baghchal_server/legal/texts`) before launch; changing either means a new version
in `legal/documents.py`, which every player is asked to agree to on their next visit.

## A single server with pm2

For a machine that already runs MariaDB and pm2, without Docker:

```sh
./runonce.sh   # settings (bhagchal2.env), database, server, migrations, web build
./start.sh     # starts the API and web app as one pm2 app, "bhagchal2"
./stop.sh      # pm2 stop bhagchal2; other pm2 apps are left alone
```

`runonce.sh` asks once for the MariaDB password of `app_user` and keeps the settings in
`bhagchal2.env` (not committed; edit it, then run `runonce.sh` again). Run it again after
every `git pull` too: it applies migrations and rebuilds the app. Players open port 7070,
where `deploy/pm2/web.mjs` serves the app and passes `/api` to the API on 127.0.0.1:7071.

**Email**: `runonce.sh` also writes `.env` (not committed) for your email provider: `SMTP_HOST`,
`SMTP_PORT` (587, or 465 for TLS from the start), `SMTP_USERNAME`, `SMTP_PASSWORD` and
`MAIL_FROM`. Fill them in and run `./start.sh` to restart. Until `SMTP_HOST` is set, emails
(sign-up links, password resets, parents' links) only appear in `pm2 logs bhagchal2`, so new
players cannot confirm their accounts; guests can play without one.

This is the server's development mode: no Redis (so one server only). With a
plain `http://` address the app is built to allow it, so passwords cross the network
unencrypted: keep it to a network you trust, or put an https proxy in front and set
`PUBLIC_URL` to the https address.

## Upgrading

```bash
git pull
docker compose -f deploy/compose.prod.yaml --env-file deploy/.env up -d --build
```

`migrate` runs first; the API replicas are replaced afterwards. So far every migration only
adds columns and tables the previous version ignores, so the old replicas keep working while
it runs; keep migrations that way (add first, remove a release later). Players are only
briefly disconnected: the app reconnects by itself and fetches what it missed. **Take a backup first** (below) when the
release notes mention a migration.

## Scaling

The API is stateless: add replicas (`API_REPLICAS`) and Caddy spreads requests over them
(least busy first, skipping replicas that fail `/health/ready`). Live events reach players on
any replica through Redis, and one replica at a time ends games that run out of time (it holds
a short lease in Redis; if it stops, another takes over within 3 seconds).

**Measured** with `tools/loadtest.py` (one machine, 4 cores, MariaDB and Redis alongside):

| Setup | Load | Moves/s | Move p50 / p95 | Move reaches opponent p95 | Errors |
|---|---|---|---|---|---|
| 1 replica | 300 players, 150 games, 2–6 s per move | 37 | 25 / 74 ms | 75 ms | 0 |
| 1 replica | 200 players, 100 games, a move every 0.5 s | 85 | 409 / 1749 ms | 1752 ms | 0 |
| 2 replicas | same, opponents on different replicas | 149 | 138 / 337 ms | 327 ms | 0 |

So one replica (one CPU core) comfortably carries about **150 games at once** at normal speed,
and it is saturated around **85 moves per second**; a second replica nearly doubles that.
Plan one replica per ~150 concurrent games, and at least two for redundancy. The cost per move
is ordinary database and ORM work (a profile shows no single hot spot), so the database is the
next limit: watch its CPU before going past a handful of replicas.

Games against the computer are searched in a pool of worker processes on each replica
(`BAGHCHAL_COMPUTER_WORKERS`, default 2; `0` searches in a thread, for tests). A hard move
takes up to a second of one core and an easy one at most 50 ms, so give each replica a
core per worker on top of its own, and add workers or replicas if computer moves start to
arrive late (the sweeper replays any computer turn left waiting more than 3 s).

Finished rated games are given a fair-play check in another pool of worker processes on each
replica (`BAGHCHAL_FAIR_PLAY_WORKERS`, default 1; `0` reviews in a thread). Every replica takes
checks from the shared queue. A check takes about 25 s of one core for a 100-move game, so one
worker handles about 3,000 rated games a day; a player picked out for a deep review costs up
to 20 more games' worth, about 100 s each. Checks never hold up play. If the queue grows
(`baghchal_fair_play_queue`), add workers or replicas; checks waiting more than 7 days are
skipped.

To load-test a deployment of your own (never production: it creates accounts directly in the
database):

```bash
BAGHCHAL_DATABASE_URL=… uv run python tools/loadtest.py seed --players 300
uv run python tools/loadtest.py run --url https://staging.example.com --players 300 --think 2,6
```

## Monitoring

`GET /metrics` on each replica (with `Authorization: Bearer $METRICS_TOKEN`; Caddy never serves
it to the internet). Prometheus finds the replicas through Docker's DNS.

| Metric | Meaning |
|---|---|
| `baghchal_http_requests_total{method,route,status}` | Requests, by route template |
| `baghchal_http_request_duration_seconds` | Time to answer, by route |
| `baghchal_websocket_connections` | Open live connections (per replica) |
| `baghchal_live_games` | Games in progress |
| `baghchal_sweeper_runs_total`, `_failures_total` | The job that ends games on time |
| `baghchal_games_ended_on_time_total` | Games it ended |
| `baghchal_mail_total{result}` | Emails sent and failed |
| `baghchal_rate_limited_total{limit}` | Requests refused by each rate limit |
| `baghchal_fair_play_queue` | Rated games waiting for their fair-play check |
| `baghchal_fair_play_checked_total`, `_failures_total`, `_skipped_total` | Checks done, failed, skipped |
| `baghchal_fair_play_reports_total` | Automatic fair-play reports filed |
| `baghchal_housekeeping_deleted_total{kind}` | Data deleted on the privacy policy's schedule (below) |

**Housekeeping**: once an hour each replica deletes what the privacy policy says is no longer
kept: expired sessions; email links a week past use or expiry; sign-ups never confirmed after
7 days; fair-play figures and checks after a year; closed reports and the
moderation log after 3 years; payment records after 8 years. The periods are in
`housekeeping.py` and tested against the policy; change both together.

**Errors**: set `SENTRY_DSN` to send unexpected errors to Sentry (or a self-hosted GlitchTip),
with no personal data. Without it, every error is a `request.unhandled` line (JSON) in
`docker compose logs api`, with its traceback and request id; the same id is in the response's
`X-Request-ID` header, so a player's report can be matched to the log.

### Alerts

Defined in `deploy/monitoring/alerts.yml` (tested by `promtool test rules alerts.test.yml`):

| Alert | Severity | First look |
|---|---|---|
| `BaghchalDown` | critical | No replica answers. `docker compose ps`; api and db logs. |
| `BaghchalReplicaDown` | warning | One replica down; Caddy routes around it. Its logs. |
| `BaghchalServerErrors` | critical | Over 2% of requests fail. Sentry or `request.unhandled` logs. |
| `BaghchalSlowRequests` | warning | p95 over 0.5 s. Database load; add replicas. |
| `BaghchalSweeperStopped` | critical | Games out of time are not ending. Redis; `sweeper.failed` in logs. |
| `BaghchalSweeperFailing` | warning | The sweeper errors. `sweeper.failed` traceback. |
| `BaghchalMailFailing` | warning | Emails fail: nobody can sign up or reset a password. SMTP. |
| `BaghchalSignInAttack` | warning | Many sign-ins refused: likely password guessing. Block the source. |
| `BaghchalFairPlayBacklog` | warning | Over 500 games waiting for checks for an hour. Add fair-play workers. |
| `BaghchalFairPlayFailing` | warning | Checks keep failing. `fair_play.failed` traceback. |

## Backups

The `backup` service dumps the database every night at `BACKUP_AT` (UTC) into the `backups`
volume, as `baghchal-YYYYMMDDTHHMMSSZ.sql.gz`, and deletes dumps older than
`BACKUP_KEEP_DAYS`. Dumps are consistent snapshots taken without blocking players; a dump is
only given its final name once complete and verified. Redis needs no backup (presence, rate
limits and live events rebuild themselves).

**A backup on the same disk is not a backup.** Copy the volume elsewhere every day, for
example with restic, rclone or your provider's snapshots:

```bash
docker run --rm -v baghchal_backups:/backups:ro -v "$PWD":/out alpine \
  sh -c 'cp /backups/*.sql.gz /out/'      # then upload /out somewhere else
```

A dump now, before an upgrade:

```bash
docker compose -f deploy/compose.prod.yaml --env-file deploy/.env exec backup \
  bash /scripts/backup.sh
```

## Restoring

1. Stop the API so nothing writes during the restore:
   `docker compose -f deploy/compose.prod.yaml --env-file deploy/.env stop api web`
2. Load the dump (this **replaces** the database):
   ```bash
   docker compose -f deploy/compose.prod.yaml --env-file deploy/.env exec backup \
     bash /scripts/restore.sh /backups/baghchal-20261017T031500Z.sql.gz --yes
   ```
3. Start again (`migrate` brings an older dump up to the current version):
   `docker compose -f deploy/compose.prod.yaml --env-file deploy/.env up -d`
4. Check: sign in, open a recent game, look at the leaderboards.

Players signed in after the dump was taken are signed out (their sessions are newer than the
dump); games after the dump are gone.

**Rehearse it**: restore last night's dump into a scratch database every month or so, and
time it. A backup that was never restored is a hope, not a backup. (This procedure was
rehearsed on MariaDB: dump, delete every account, restore; accounts, sessions and the schema
version came back and players could sign in again.)

## Routine

- Daily: glance at alerts; check that a new dump exists and was copied off the machine.
- Weekly: `docker compose logs api | grep request.unhandled` for errors Sentry did not catch;
  disk space on the database and backup volumes.
- Monthly: restore drill; update images (`docker compose pull` for MariaDB, Redis, Caddy,
  Prometheus) and rebuild.
