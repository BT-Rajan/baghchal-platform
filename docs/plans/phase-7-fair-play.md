# Phase 7 plan: automatic fair-play checks

Status: built on branch `phase-7-fair-play`. This is the last open item of Phase 7. The
computer opponent, quick pairing and game history with replay are already on `main`.

## Goal
Find players whose rated games are consistently closer to engine play than a person's, and put
them in the moderators' report queue with the evidence.

- **Never punish automatically.** A check only files a report. A moderator decides, with the
  same tools and audit log as any other report.
- **Never touch a live game.** Checks run after games end, in the background. A slow or
  failing check never delays a move, a result or a rating.
- **Few false alarms.** A flag needs many games and many telling positions, and must hold up
  under a deeper second look. The cost of wrongly accusing a player is higher than the cost of
  missing one for a while.
- **Players are not told.** Players are not told about a check or its result, only the
  moderators' decision. The rules page says that checks exist.

## What is already there
- **Move reviewer:** `review()` in `engine/src/baghchal_engine/review.py` scores every legal
  move of every position (depth 3, 0.25 s), as post-game analysis does.
- **Worker pool:** `ComputerPlayers` runs engine work in worker processes.
- **Move timings:** `game_moves` keeps `think_ms` and `clock_ms` for every move.
- **Reports:** `ReportReason.CHEATING`, the report queue, suspensions, bans and the moderation
  log. Every report has a human reporter today.
- **Background loop:** the sweeper's Redis lease pattern, which keeps background work to one
  server at a time.

## The measurement problem, and the calibration
Agreement with our own reviewer is not the same as engine assistance. A player helped by an
engine that searches deeper than the reviewer can look *less* perfect to it than one who
happens to think like the reviewer. A single game also has only a handful of positions that
tell anything. So the checks:

1. are aggregated over many games, never judged on one;
2. use two stages, a cheap screen on every rated game and a deep review (as deep as our Hard
   engine) only for players the screen picks out;
3. have thresholds that come from a calibration run, `tools/fair_play_calibrate.py`, which is
   committed and can be repeated. They are settings in
   `server/src/baghchal_server/fair_play/thresholds.py` and can be tightened later.

**Calibration**: 64 bot games, 8 for each pairing of Easy, Medium and Hard. Every move was
reviewed by both stages. Each row averages windows of 8 games, with the range across windows
in brackets.

| Bot (stands in for) | Quick review: engine's move / loss / mistakes | Deep review: engine's move / loss / mistakes |
|---|---|---|
| Easy (a person who makes mistakes) | 38% (0–67) / 453 (158–844) / 12% (6–21) | 22% / 570 / 20% |
| Medium (a weak engine, as deep as the quick review) | 99.7% (97–100) / 0.2 (0–2) / 0% | 74% (54–90) / 119 (33–228) / 5% (1–9) |
| Hard (a strong engine, as deep as the deep review) | 85% (72–96) / 37 (4–67) / 1.3% (0–2.7) | 100% / 0 / 0% |

The calibration gives two ways to be reported, each well clear of the bots that play like
people:
- **Matches the quick review exactly** (engine's move at least 97%, average loss at most 3,
  mistakes at most 0.2%). Only an engine as deep as the quick review does this; even Hard
  does not. No deep review is needed.
- **Screened, then confirmed.** The screen needs at least 70% of the engine's moves, an
  average loss of at most 80 and mistakes of at most 3%. That catches Hard, and Easy is far
  off. The deep review then needs at least 95%, a loss of at most 15 and mistakes of at most
  0.5%. Medium does not reach this; Hard does.

Bots are not people. Strong people sit somewhere between these bots, and real data will
show where. Until then the bars stay this far out, and every report is only a reason for a
moderator to look.

## Design

### 1. Queue (never lost)
- `_after_finish` adds a `fair_play_checks` row for every **rated** game with a result. It runs
  in the same transaction that rates the game, so a finished game cannot miss its check.
- Not queued: casual games, games against the computer (always casual), aborted games, and
  games under 20 plies.

### 2. Worker
- Every server runs a background loop that takes checks from the shared queue. A conditional
  UPDATE claims each one, so no two servers ever check the same game, and more servers mean
  more checks done. A claimed row carries `claimed_at`, refreshed during a long deep review,
  so a check whose server died is taken again after 10 minutes. At most 3 attempts are made,
  then the row is marked `failed`, logged and counted.
- Reviews run in their **own** process pool (`BAGHCHAL_FAIR_PLAY_WORKERS`, default 1; 0 turns
  the checks off). They therefore never queue behind, or hold up, the computer opponent.
- Backlog policy: a check still pending after 7 days is marked `skipped`. A queue-depth gauge
  and done, failed and skipped counters go to `/metrics`, and an alert fires on growth.

### 3. Stage 1, the screen (every queued game)
Depth 3 at 0.25 s per position, the same review as post-game analysis. That is about 25 s of
CPU for a 100-ply game, so one worker handles about 3,000 games a day.

For each player in the game, `fair_play_sides` stores:
- **Decisive positions:** positions where the best move beats the second best by more than 60.
- In decisive positions: how often the reviewer's choice was played, and the average loss
  (capped at 1,000).
- Mistake and blunder rates over all of the player's moves.
- Move timing: median think time, how evenly spread it is (coefficient of variation), and the
  share of moves under 1 s. Timing is shown to moderators but never used to flag on its own.

### 4. Window and the stage 2 confirmation
- A player's window is their last 20 checked rated games within 90 days, and must have at
  least 8 games and 80 decisive positions before anything is judged.
- **Exact bar:** a window that matches the quick review move for move is reported straight
  away.
- **Screen bar:** otherwise, a window clean enough for an engine earns stage 2.
- **Stage 2:** a deep review (depth 6, 1 s per position, Hard's strength) of the player's own
  moves in the window's games. It costs about 100 s for each game, and each game is reviewed
  once; the result is kept.
- **Confirm bar:** the deep figures must pass it for a report.

### 5. The automatic report
- Reason `cheating`, with no reporter (`reporter_id` becomes nullable; the API shows
  `reporter: null`, and the app shows "Automatic fair-play check").
- The details hold the numbers: games, decisive positions, agreement, average loss, mistake
  rate and timing, for both the screen and the deep review. `game_id` is the latest game.
- `open_key` is `auto:<player id>`, so a player has at most one open automatic report.
- After a moderator dismisses one, no new automatic report is filed for 30 days, or until 20
  more games have been checked.

### 6. What moderators see
- `GET /api/v1/mod/players/{username}/fair-play` returns the window, game by game, with both
  stages' figures and links to the games.
- The app's moderation pages show the automatic reports and this section.

## Data
Migration `0017_fair_play`:
- `fair_play_checks`: `game_id` PK/FK, `status` (pending/done/failed/skipped), `attempts`,
  `claimed_at`, `checked_at`, `created_at`. Index on (`status`, `created_at`).
- `fair_play_sides`: (`game_id`, `user_id`, `stage`) PK, `side`, `moves`, `decisive`,
  `agreed`, `decisive_loss`, `mistakes`, `blunders`, `think_median_ms`, `think_spread`,
  `fast_moves`, `created_at`. Stored as counts so figures add up across games. Index on
  (`user_id`, `stage`, `created_at`).
- `reports.reporter_id` becomes nullable.

Deleting an account removes its rows (cascade). Fair-play figures are moderation data, like
reports about a player. They are not part of a player's own data export, as reports about
them are not.

## Rules and docs
- `docs/rules.md` gets a "Fair play" section. It says rated games are checked after they end,
  that a check can only bring a moderator to look, and that no penalty is ever automatic.
- `README.md` changes Phase 7 to ✅. `docs/operations.md` gets the new setting, metrics and
  alert.

## Tests (100% branch coverage, as for the rest of the server)
- **Engine:** the stats from a review (decisive positions, agreement, loss, rates), checked
  on hand-made reviews and a real game.
- **Queue:** finishing a rated game queues exactly one check. Casual, computer, aborted and
  short games queue none.
- **Worker:**
  - claim, lease and retry
  - a crashed claim is taken again
  - failure after 3 attempts
  - backlog skipping
  - two servers never check the same game
- **Window:** below the minimums nothing happens; the screen bar leads to stage 2; the
  confirm bar leads to exactly one automatic report; the cooldown after a dismissal works.
- **Moderation:** automatic reports in the queue and on the player's record, the fair-play
  endpoint (staff only), and `reporter: null` in the API.
- **Real-process test:** one check run in the real worker pool.
- **App:** moderation screens with automatic reports (Jest).

## Out of scope
- Anything during live games: tab or focus tracking, device fingerprints, client-side checks.
- Automatic penalties, and refunding rating points to a cheater's opponents. A moderator tool
  for refunds can come later.
- Population-relative checks (a player compared with others of the same rating). These need
  real data and come once enough rated games have been checked.

## Delivery steps
1. Calibration tool in `tools/`, its full run, and thresholds set from it (documented here).
2. Engine: fair-play statistics from a review.
3. Migration 0017, models, queueing in `_after_finish`.
4. Worker loop, process pool, metrics, backlog policy.
5. Window, stage 2 and automatic reports; nullable reporter through the API and app.
6. Moderator endpoint and app screens.
7. Rules, README and operations docs; tests at 100%; CI run by hand (it is paused on `main`).
