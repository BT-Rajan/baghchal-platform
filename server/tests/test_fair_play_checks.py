"""Automatic fair-play checks: queueing, the worker, the window and automatic reports."""

import asyncio
import random
import uuid
from contextlib import AsyncExitStack
from typing import Any

import pytest
from fastapi import FastAPI
from sqlalchemy import delete, func, select

from baghchal_engine import Game as EngineGame
from baghchal_engine import format_move
from baghchal_engine.fair_play import Figures as EngineFigures
from baghchal_server.app import create_app
from baghchal_server.config import Settings
from baghchal_server.deps import AppState
from baghchal_server.fair_play import service, thresholds, worker
from baghchal_server.fair_play.models import CheckStatus, FairPlayCheck, FairPlaySide, Stage
from baghchal_server.fair_play.queue import enqueue
from baghchal_server.games.models import EndReason, Game, GameMove, GameStatus
from baghchal_server.moderation.models import Report, ReportStatus
from baghchal_server.moderators import run
from baghchal_server.ratelimit import MemoryRateLimiter

from .conftest import Clock, Player, PlayerFactory
from .test_games import _online

Figures = dict[str, int]


def _legal(plies: int, seed: int = 7) -> list[str]:
    """A legal game of ``plies`` moves that is not over yet."""
    rng = random.Random(seed)
    while True:
        game, moves = EngineGame(), list[str]()
        while game.outcome is None and len(moves) < plies:
            move = rng.choice(game.legal_moves())
            moves.append(format_move(move))
            game.play(move)
        if len(moves) == plies:
            return moves


MOVES = _legal(24)


def fig(
    *,
    moves: int = 12,
    decisive: int = 12,
    agreed: int = 12,
    decisive_loss: int = 0,
    mistakes: int = 0,
    blunders: int = 0,
) -> Figures:
    return {
        "moves": moves,
        "decisive": decisive,
        "agreed": agreed,
        "decisive_loss": decisive_loss,
        "mistakes": mistakes,
        "blunders": blunders,
    }


PERFECT = fig()
"""A shallow engine's play: every decisive position right, as the quick review sees it."""
ENGINE_LIKE = fig(agreed=10, decisive_loss=480)
"""A strong engine's play as the quick review sees it: 83%, average loss 40, no mistakes."""
HUMAN = fig(agreed=6, decisive_loss=3000, mistakes=2, blunders=1)


class Reviewer:
    """A stand-in for the engine: figures by depth (quick or deep), and a log of calls."""

    def __init__(self, screen: Figures, confirm: Figures | None = None) -> None:
        self.screen = screen
        self.confirm = confirm or PERFECT
        self.calls: list[tuple[int, str | None]] = []

    async def __call__(
        self, moves: list[str], depth: int, seconds: float, only: str | None
    ) -> dict[str, Figures]:
        self.calls.append((depth, only))
        found = self.screen if depth == thresholds.SCREEN_DEPTH else self.confirm
        return {"goat": found, "tiger": found}

    @property
    def deep_calls(self) -> int:
        return sum(depth == thresholds.CONFIRM_DEPTH for depth, _ in self.calls)


@pytest.fixture
async def moderator(players: PlayerFactory, settings: Settings) -> Player:
    mod = await players("warden")
    assert await run(settings, ["grant", "warden"]) == "warden is now a moderator."
    return mod


def _state(app: FastAPI) -> AppState:
    state: AppState = app.state.ctx
    return state


async def _insert_game(
    app: FastAPI,
    goat: Player,
    tiger: Player,
    *,
    rated: bool = True,
    winner: str | None = "goat",
    moves: list[str] = MOVES,
    think_ms: list[int] | None = None,
) -> uuid.UUID:
    """A finished game, queued for its check as the game service would."""
    state = _state(app)
    now = state.clock()
    think = think_ms or [2_000 + 100 * i for i in range(len(moves))]
    async with state.sessions() as db:
        game = Game(
            id=uuid.uuid4(),
            goat_id=uuid.UUID(goat.id),
            tiger_id=uuid.UUID(tiger.id),
            rated=rated,
            initial_ms=300_000,
            increment_ms=3_000,
            status=GameStatus.FINISHED,
            winner=winner,
            end_reason=EndReason.RESIGNED if winner else EndReason.ABORTED,
            ply=len(moves),
            position="T3T/5/5/5/T3T g 20 0",
            goat_ms=300_000,
            tiger_ms=300_000,
            turn_started_at=now,
            deadline_at=None,
            goat_rating=1500,
            tiger_rating=1500,
            lag_ms=0,
            created_at=now,
            finished_at=now,
        )
        db.add(game)
        await db.flush()
        db.add_all(
            GameMove(
                game_id=game.id,
                ply=ply,
                notation=move,
                played_at=now,
                think_ms=think[ply],
                clock_ms=300_000,
            )
            for ply, move in enumerate(moves)
        )
        enqueue(db, game, now)
        await db.commit()
        return game.id


async def _check_all(app: FastAPI, review: Reviewer | None = None) -> int:
    """Run the worker until the queue is empty; returns how many games it checked."""
    state = _state(app)
    if review is not None:
        state.fair_play.review = review  # type: ignore[method-assign]
    checked = 0
    while await worker.check_next(state):
        checked += 1
    return checked


async def _rows(app: FastAPI, model: Any, **where: Any) -> list[Any]:
    async with _state(app).sessions() as db:
        query = select(model).filter_by(**where)
        return list((await db.scalars(query)).all())


async def _auto_reports(app: FastAPI) -> list[Report]:
    return await _rows(app, Report, reporter_id=None)


# ── Queueing ──────────────────────────────────────────────────────────────


async def test_rated_games_with_a_result_are_queued_as_they_end(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice, bob = await players("alice"), await players("bob")
    async with AsyncExitStack() as stack:
        await _online(app, stack, alice, bob)
        r = await alice.http.post(
            "/api/v1/challenges",
            json={"opponent": "bob", "time_control": "5+3", "rated": True},
        )
        r = await bob.http.post(f"/api/v1/challenges/{r.json()['id']}/accept")
        game = (await bob.http.get(f"/api/v1/games/{r.json()['game_id']}")).json()
        by_id = {alice.id: alice, bob.id: bob}
        for move in MOVES[: thresholds.MIN_PLIES]:
            mover = by_id[game[game["side_to_move"]]["id"]]
            r = await mover.http.post(
                f"/api/v1/games/{game['id']}/moves", json={"ply": game["ply"], "move": move}
            )
            assert r.status_code == 200, r.text
            game = r.json()
        assert (await alice.http.post(f"/api/v1/games/{game['id']}/resign")).status_code == 200
    (queued,) = await _rows(app, FairPlayCheck)
    assert (str(queued.game_id), queued.status, queued.attempts) == (
        game["id"],
        CheckStatus.PENDING,
        0,
    )


async def test_casual_unfinished_and_short_games_are_not_queued(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice, bob = await players("alice"), await players("bob")
    await _insert_game(app, alice, bob, rated=False)
    await _insert_game(app, alice, bob, winner=None)  # aborted: no result
    await _insert_game(app, alice, bob, moves=MOVES[: thresholds.MIN_PLIES - 1])
    assert await _rows(app, FairPlayCheck) == []


# ── The worker ────────────────────────────────────────────────────────────


async def test_the_worker_screens_a_game_with_the_real_engine(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice, bob = await players("alice"), await players("bob")
    think = [500, 3_000] * (len(MOVES) // 2)  # alice (goats) moves fast, bob slowly
    game_id = await _insert_game(app, alice, bob, think_ms=think)
    assert await _check_all(app) == 1
    (check,) = await _rows(app, FairPlayCheck)
    assert (check.status, check.checked_at) == (CheckStatus.DONE, _state(app).clock())
    sides = {r.side: r for r in await _rows(app, FairPlaySide, game_id=game_id)}
    goat, tiger = sides["goat"], sides["tiger"]
    assert (str(goat.user_id), str(tiger.user_id)) == (alice.id, bob.id)
    assert (goat.stage, goat.moves, tiger.moves) == (Stage.SCREEN, 12, 12)
    assert 0 <= goat.agreed <= goat.decisive <= goat.moves
    assert (goat.think_median_ms, goat.think_spread, goat.fast_moves) == (500, 0.0, 12)
    assert (tiger.think_median_ms, tiger.fast_moves) == (3_000, 0)
    metrics = _state(app).metrics
    assert metrics.fair_play_checked._value.get() == 1
    assert await _check_all(app) == 0  # nothing left


async def test_two_servers_never_take_the_same_check(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob = await players("alice"), await players("bob")
    game_id = await _insert_game(app, alice, bob)
    state = _state(app)
    async with state.sessions() as one, state.sessions() as two:
        assert await service.claim(one, clock()) == game_id
        assert await service.claim(two, clock()) is None
        clock.advance(minutes=9)
        await service.touch(one, game_id, clock())  # still working on it
        clock.advance(minutes=9)
        assert await service.claim(two, clock()) is None
        clock.advance(minutes=11)  # the first server stopped: taken again
        assert await service.claim(two, clock()) == game_id
    (check,) = await _rows(app, FairPlayCheck)
    assert check.attempts == 2


async def test_losing_a_claim_to_another_server(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob = await players("alice"), await players("bob")
    game_id = await _insert_game(app, alice, bob)
    state = _state(app)
    async with state.sessions() as one, state.sessions() as two:
        looked = one.scalars

        async def other_server_first(*args: Any, **kwargs: Any) -> Any:
            found = await looked(*args, **kwargs)  # this server sees the check as free...
            assert await service.claim(two, clock()) == game_id  # ...the other takes it
            return found

        one.scalars = other_server_first  # type: ignore[method-assign]
        assert await service.claim(one, clock()) is None


async def test_a_failing_check_is_retried_then_given_up(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob = await players("alice"), await players("bob")
    await _insert_game(app, alice, bob)
    state = _state(app)

    async def broken(*args: Any) -> dict[str, Figures]:
        raise RuntimeError("worker died")

    state.fair_play.review = broken  # type: ignore[method-assign, assignment]
    for _ in range(service.MAX_ATTEMPTS):
        assert await worker.check_next(state) is True
        assert await worker.check_next(state) is False  # claimed: not again before RECLAIM
        clock.advance(minutes=11)
    assert await worker.check_next(state) is False
    (check,) = await _rows(app, FairPlayCheck)
    assert (check.status, check.attempts) == (CheckStatus.FAILED, service.MAX_ATTEMPTS)
    assert state.metrics.fair_play_failures._value.get() == service.MAX_ATTEMPTS


async def test_checks_waiting_too_long_are_skipped(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob = await players("alice"), await players("bob")
    await _insert_game(app, alice, bob)
    clock.advance(days=8)
    assert await _check_all(app, Reviewer(HUMAN)) == 0
    (check,) = await _rows(app, FairPlayCheck)
    assert check.status == CheckStatus.SKIPPED
    assert _state(app).metrics.fair_play_skipped._value.get() == 1


async def test_the_loop_keeps_going_after_errors(
    app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    results: list[bool | Exception] = [True, RuntimeError("database away"), False]

    async def check_next(state: AppState) -> bool:
        result = results.pop(0) if results else False
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(worker, "check_next", check_next)
    monkeypatch.setattr(worker, "IDLE_SECONDS", 0)
    task = asyncio.create_task(worker.run(_state(app)))
    while results:
        await asyncio.sleep(0.01)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


async def test_the_server_runs_the_checks_in_the_background(
    settings: Settings, players: PlayerFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    ran = asyncio.Event()

    async def check_next(state: AppState) -> bool:
        ran.set()
        return False

    monkeypatch.setattr(worker, "check_next", check_next)
    app = create_app(
        settings.model_copy(update={"fair_play_checks": True}), limiter=MemoryRateLimiter()
    )
    async with app.router.lifespan_context(app):
        await asyncio.wait_for(ran.wait(), timeout=2)


async def test_reviewing_in_a_separate_process() -> None:
    checker = worker.FairPlayChecker(workers=1)
    try:
        found = await checker.review(["c3", "a1-a2"], 3, 0.25, "tiger")
        assert found["goat"]["moves"] == 0  # only the tigers' move was reviewed
        assert found["tiger"]["moves"] == 1
    finally:
        checker.stop()


# ── The window and automatic reports ──────────────────────────────────────


async def _games(app: FastAPI, goat: Player, tiger: Player, n: int) -> None:
    for _ in range(n):
        await _insert_game(app, goat, tiger)


async def test_play_matching_the_quick_review_exactly_is_reported(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice, bob = await players("alice"), await players("bob")
    review = Reviewer(PERFECT)
    await _games(app, alice, bob, thresholds.MIN_GAMES - 1)
    assert await _check_all(app, review) == thresholds.MIN_GAMES - 1
    assert await _auto_reports(app) == []  # not enough games yet

    await _games(app, alice, bob, 1)
    await _check_all(app, review)
    reports = await _auto_reports(app)
    assert {str(r.target_id) for r in reports} == {alice.id, bob.id}
    report = reports[0]
    assert (report.reason, report.status, report.open_key) == (
        "cheating",
        ReportStatus.OPEN,
        f"auto:{report.target_id}",
    )
    assert "last 8 rated games" in report.details
    assert "No deep review" in report.details
    assert review.deep_calls == 0
    assert _state(app).metrics.fair_play_reports._value.get() == 2

    # One open automatic report per player, however many more games.
    await _games(app, alice, bob, 2)
    await _check_all(app, review)
    assert len(await _auto_reports(app)) == 2


async def test_engine_like_play_gets_a_deep_review_that_confirms_it(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice, bob = await players("alice"), await players("bob")
    review = Reviewer(ENGINE_LIKE, confirm=PERFECT)
    await _games(app, alice, bob, thresholds.MIN_GAMES)
    await _check_all(app, review)
    (report, _) = await _auto_reports(app)
    assert "Deep review: 96 decisive positions, engine's move 100.0%" in report.details
    # Each player's moves in each game are reviewed deeply once, that side only.
    assert review.deep_calls == 2 * thresholds.MIN_GAMES
    assert {only for depth, only in review.calls if depth == thresholds.CONFIRM_DEPTH} == {
        "goat",
        "tiger",
    }
    deep = await _rows(app, FairPlaySide, stage=Stage.CONFIRM)
    assert len(deep) == 2 * thresholds.MIN_GAMES


async def test_a_deep_review_that_does_not_confirm_files_nothing(
    app: FastAPI, players: PlayerFactory
) -> None:
    alice, bob = await players("alice"), await players("bob")
    review = Reviewer(ENGINE_LIKE, confirm=HUMAN)
    await _games(app, alice, bob, thresholds.MIN_GAMES)
    await _check_all(app, review)
    assert await _auto_reports(app) == []
    assert review.deep_calls == 2 * thresholds.MIN_GAMES
    # Another game: only the new one needs a deep review, the rest are kept.
    await _games(app, alice, bob, 1)
    await _check_all(app, review)
    assert review.deep_calls == 2 * (thresholds.MIN_GAMES + 1)


async def test_human_play_is_left_alone(app: FastAPI, players: PlayerFactory) -> None:
    alice, bob = await players("alice"), await players("bob")
    review = Reviewer(HUMAN)
    await _games(app, alice, bob, thresholds.WINDOW_GAMES + 2)
    await _check_all(app, review)
    assert await _auto_reports(app) == []
    assert review.deep_calls == 0


async def test_a_dismissed_automatic_report_cools_down(
    app: FastAPI,
    players: PlayerFactory,
    moderator: Player,
    clock: Clock,
) -> None:
    alice, bob = await players("alice"), await players("bob")
    review = Reviewer(PERFECT)
    await _games(app, alice, bob, thresholds.MIN_GAMES)
    await _check_all(app, review)
    queue = (await moderator.http.get("/api/v1/mod/reports")).json()
    assert {r["reporter"] for r in queue} == {None}
    for r in queue:
        dismissed = await moderator.http.post(
            f"/api/v1/mod/reports/{r['id']}/dismiss", json={"reason": "Strong, not a cheat"}
        )
        assert dismissed.status_code == 200, dismissed.text

    clock.advance(days=1)
    await _games(app, alice, bob, thresholds.COOLDOWN_GAMES - 1)
    await _check_all(app, review)
    assert await _rows(app, Report, status=ReportStatus.OPEN) == []  # cooling down

    await _games(app, alice, bob, 1)  # enough new games to look again
    await _check_all(app, review)
    assert len(await _rows(app, Report, status=ReportStatus.OPEN)) == 2

    # Or once the cooldown has passed.
    for r in (await moderator.http.get("/api/v1/mod/reports")).json():
        await moderator.http.post(
            f"/api/v1/mod/reports/{r['id']}/dismiss", json={"reason": "Still fine"}
        )
    clock.advance(days=31)
    await _games(app, alice, bob, thresholds.MIN_GAMES)
    await _check_all(app, review)
    assert len(await _rows(app, Report, status=ReportStatus.OPEN)) == 2


async def test_old_games_leave_the_window(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob = await players("alice"), await players("bob")
    review = Reviewer(PERFECT)
    await _games(app, alice, bob, thresholds.MIN_GAMES - 1)
    await _check_all(app, review)
    clock.advance(days=thresholds.WINDOW_DAYS + 1)
    await _games(app, alice, bob, 1)
    await _check_all(app, review)
    assert await _auto_reports(app) == []


async def test_two_servers_reporting_at_once_file_one_report(
    app: FastAPI, players: PlayerFactory, clock: Clock
) -> None:
    alice, bob = await players("alice"), await players("bob")
    await _games(app, alice, bob, thresholds.MIN_GAMES)
    await _check_all(app, Reviewer(ENGINE_LIKE, confirm=HUMAN))
    state = _state(app)
    user_id = uuid.UUID(alice.id)
    async with state.sessions() as db:  # forget the deep reviews: this server starts them
        await db.execute(delete(FairPlaySide).where(FairPlaySide.stage == Stage.CONFIRM))
        await db.commit()

    class OtherServerFirst(Reviewer):
        """While this server reviews, another one confirms the same game and files the
        report."""

        async def __call__(self, *args: Any) -> dict[str, Figures]:
            async with state.sessions() as other:
                rows = await service.window(other, user_id, clock())
                for row in rows:
                    await other.merge(
                        FairPlaySide(
                            game_id=row.game_id,
                            user_id=user_id,
                            stage=Stage.CONFIRM,
                            side=row.side,
                            **PERFECT,
                            think_median_ms=0,
                            think_spread=0.0,
                            fast_moves=0,
                            created_at=clock(),
                        )
                    )
                await other.commit()
                await service._report(
                    other,
                    user_id=user_id,
                    rows=rows,
                    screened=service.total(r.figures for r in rows),
                    deep=None,
                    now=clock(),
                )
            return await super().__call__(*args)

    async with state.sessions() as db:
        filed = await service.evaluate(
            db, OtherServerFirst(ENGINE_LIKE), user_id, clock(), _no_heartbeat
        )
        assert filed is False  # theirs is open: none from here
    assert await _open_auto_reports(app, alice) == 1

    # And a report filed between this server's last look and its own insert.
    async with state.sessions() as db:
        rows = await service.window(db, user_id, clock())
        assert (
            await service._report(
                db,
                user_id=user_id,
                rows=rows,
                screened=service.total(r.figures for r in rows),
                deep=None,
                now=clock(),
            )
            is False
        )


async def _no_heartbeat() -> None:
    return None


async def _open_auto_reports(app: FastAPI, player: Player) -> int:
    async with _state(app).sessions() as db:
        return (
            await db.scalar(
                select(func.count())
                .select_from(Report)
                .where(
                    Report.target_id == uuid.UUID(player.id),
                    Report.reporter_id.is_(None),
                    Report.status == ReportStatus.OPEN,
                )
            )
            or 0
        )


# ── What moderators see ───────────────────────────────────────────────────


async def test_moderators_see_a_players_fair_play_figures(
    app: FastAPI,
    players: PlayerFactory,
    moderator: Player,
) -> None:
    alice, bob = await players("alice"), await players("bob")
    r = await moderator.http.get("/api/v1/mod/players/alice/fair-play")
    assert r.status_code == 200
    assert r.json() == {
        "games": [],
        "screen": {
            "moves": 0,
            "decisive": 0,
            "agreement": 0.0,
            "average_loss": 0.0,
            "mistake_rate": 0.0,
            "blunders": 0,
        },
        "confirm": None,
        "screen_passed": False,
    }

    await _games(app, alice, bob, thresholds.MIN_GAMES)
    await _check_all(app, Reviewer(ENGINE_LIKE, confirm=HUMAN))
    found = (await moderator.http.get("/api/v1/mod/players/alice/fair-play")).json()
    assert len(found["games"]) == thresholds.MIN_GAMES
    first = found["games"][0]
    assert (first["side"], first["opponent"]["username"]) == ("goat", "bob")
    assert first["screen"]["agreement"] == pytest.approx(10 / 12, abs=1e-4)
    assert first["confirm"]["mistake_rate"] == pytest.approx(2 / 12, abs=1e-4)
    assert found["screen"]["decisive"] == 12 * thresholds.MIN_GAMES
    assert found["screen_passed"] is True
    assert found["confirm"]["agreement"] == 0.5

    bobs = (await moderator.http.get("/api/v1/mod/players/bob/fair-play")).json()
    assert bobs["games"][0]["opponent"]["username"] == "alice"

    r = await alice.http.get("/api/v1/mod/players/bob/fair-play")
    assert (r.status_code, r.json()["error"]["code"]) == (403, "not_a_moderator")
    r = await moderator.http.get("/api/v1/mod/players/nobody/fair-play")
    assert r.status_code == 404


async def test_an_automatic_report_on_the_players_record(
    app: FastAPI,
    players: PlayerFactory,
    moderator: Player,
) -> None:
    alice, bob = await players("alice"), await players("bob")
    await _games(app, alice, bob, thresholds.MIN_GAMES)
    await _check_all(app, Reviewer(PERFECT))
    record = (await moderator.http.get("/api/v1/mod/players/alice")).json()
    (report,) = record["reports"]
    assert (report["reporter"], report["reason"]) == (None, "cheating")


def test_describe_reads_well() -> None:
    text = service.describe(
        EngineFigures(moves=100, decisive=50, agreed=49, decisive_loss=50), None, 9, 2_500
    )
    assert text.startswith("Automatic fair-play check over the player's last 9 rated games.")
    assert "Quick review: 50 decisive positions, engine's move 98.0%, average loss 1" in text
    assert "Median think time 2.5 s." in text


def test_timing_figures() -> None:
    assert service._timing([]) == (0, 0.0, 0)
    assert service._timing([0, 0]) == (0, 0.0, 2)
    assert service._timing([1_000, 3_000]) == (2_000, 0.5, 0)
