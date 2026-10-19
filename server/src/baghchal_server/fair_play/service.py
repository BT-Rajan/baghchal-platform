"""Automatic fair-play checks (docs/plans/phase-7-fair-play.md).

Every rated game is queued when it is rated. A worker takes queued games one at a time and
reviews them quickly (the *screen*). When a player's latest games, taken together, are as clean
as an engine's, their moves in those games get a deep review (the *confirmation*); if that
agrees, an automatic report goes to the moderators. Nothing here ever penalises a player.
"""

import statistics
import uuid
from collections.abc import Awaitable, Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Final

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_engine.fair_play import Figures
from baghchal_server.fair_play import thresholds as t
from baghchal_server.fair_play.models import CheckStatus, FairPlayCheck, FairPlaySide, Stage
from baghchal_server.games import service as games
from baghchal_server.games.models import GameMove
from baghchal_server.moderation.models import Report, ReportReason, ReportStatus

MAX_ATTEMPTS: Final = 3
RECLAIM_AFTER: Final = timedelta(minutes=10)
"""A claimed check not finished by then is taken again (its server stopped)."""
GIVE_UP_AFTER: Final = timedelta(days=7)
"""A check still waiting this long is skipped: the queue is behind, and old games matter less."""
FAST_MS: Final = 1_000
CLAIM_BATCH: Final = 5

Reviewer = Callable[[list[str], int, float, str | None], Awaitable[dict[str, dict[str, int]]]]
"""Reviews a game's moves (depth, seconds per position, only one side or both) and returns
each side's figures (``vars`` of ``baghchal_engine.fair_play.Figures``), in a worker."""
Heartbeat = Callable[[], Awaitable[None]]


def auto_report_key(user_id: uuid.UUID) -> str:
    return f"auto:{user_id}"


# ── The queue ─────────────────────────────────────────────────────────────


async def skip_stale(db: AsyncSession, now: datetime) -> int:
    """Skip checks that have waited too long, and give up on ones that keep failing."""
    skipped = await db.execute(
        update(FairPlayCheck)
        .where(
            FairPlayCheck.status == CheckStatus.PENDING,
            FairPlayCheck.created_at < now - GIVE_UP_AFTER,
        )
        .values(status=CheckStatus.SKIPPED, checked_at=now)
    )
    await db.execute(
        update(FairPlayCheck)
        .where(
            FairPlayCheck.status == CheckStatus.PENDING,
            FairPlayCheck.attempts >= MAX_ATTEMPTS,
            FairPlayCheck.claimed_at < now - RECLAIM_AFTER,
        )
        .values(status=CheckStatus.FAILED, checked_at=now)
    )
    await db.commit()
    return skipped.rowcount  # type: ignore[attr-defined, no-any-return]


async def pending(db: AsyncSession) -> int:
    """Checks waiting in the queue (for the metrics)."""
    return (
        await db.scalar(
            select(func.count())
            .select_from(FairPlayCheck)
            .where(FairPlayCheck.status == CheckStatus.PENDING)
        )
        or 0
    )


async def claim(db: AsyncSession, now: datetime) -> uuid.UUID | None:
    """Take the oldest check nobody is working on. A conditional UPDATE, so two servers never
    take the same one."""
    free = or_(FairPlayCheck.claimed_at.is_(None), FairPlayCheck.claimed_at < now - RECLAIM_AFTER)
    candidates = (
        await db.scalars(
            select(FairPlayCheck.game_id)
            .where(
                FairPlayCheck.status == CheckStatus.PENDING,
                FairPlayCheck.attempts < MAX_ATTEMPTS,
                free,
            )
            .order_by(FairPlayCheck.created_at, FairPlayCheck.game_id)
            .limit(CLAIM_BATCH)
        )
    ).all()
    for game_id in candidates:
        taken = await db.execute(
            update(FairPlayCheck)
            .where(
                FairPlayCheck.game_id == game_id,
                FairPlayCheck.status == CheckStatus.PENDING,
                free,
            )
            .values(claimed_at=now, attempts=FairPlayCheck.attempts + 1)
        )
        await db.commit()
        if taken.rowcount == 1:  # type: ignore[attr-defined]
            return game_id
    return None


async def touch(db: AsyncSession, game_id: uuid.UUID, now: datetime) -> None:
    """Keep a long check claimed (the deep review can take minutes)."""
    await db.execute(
        update(FairPlayCheck).where(FairPlayCheck.game_id == game_id).values(claimed_at=now)
    )
    await db.commit()


# ── The screen ────────────────────────────────────────────────────────────


def _timing(think: Sequence[int]) -> tuple[int, float, int]:
    """Median think time, its spread (standard deviation over mean) and fast moves."""
    if not think:
        return 0, 0.0, 0
    mean = statistics.fmean(think)
    spread = statistics.pstdev(think) / mean if mean else 0.0
    return int(statistics.median(think)), round(spread, 3), sum(ms < FAST_MS for ms in think)


async def _think_times(db: AsyncSession, game_id: uuid.UUID) -> dict[str, list[int]]:
    rows = await db.execute(
        select(GameMove.ply, GameMove.think_ms)
        .where(GameMove.game_id == game_id)
        .order_by(GameMove.ply)
    )
    times: dict[str, list[int]] = {"goat": [], "tiger": []}
    for ply, think_ms in rows.all():
        times["goat" if ply % 2 == 0 else "tiger"].append(think_ms)  # goats move first
    return times


def _row(  # noqa: PLR0913 - one row's worth
    *,
    game_id: uuid.UUID,
    user_id: uuid.UUID,
    stage: Stage,
    side: str,
    figures: dict[str, int],
    think: Sequence[int],
    now: datetime,
) -> FairPlaySide:
    median, spread, fast = _timing(think)
    return FairPlaySide(
        game_id=game_id,
        user_id=user_id,
        stage=stage,
        side=side,
        **figures,
        think_median_ms=median,
        think_spread=spread,
        fast_moves=fast,
        created_at=now,
    )


async def screen(
    db: AsyncSession, review: Reviewer, game_id: uuid.UUID, now: datetime
) -> list[uuid.UUID]:
    """Review a claimed game quickly and store both players' figures. Returns the players."""
    game = await games.get_game(db, game_id)
    moves = await games.move_list(db, game)
    times = await _think_times(db, game_id)
    found = await review(moves, t.SCREEN_DEPTH, t.SCREEN_SECONDS, None)
    players = {"goat": game.goat_id, "tiger": game.tiger_id}
    for side, user_id in players.items():
        db.add(
            _row(
                game_id=game_id,
                user_id=user_id,
                stage=Stage.SCREEN,
                side=side,
                figures=found[side],
                think=times[side],
                now=now,
            )
        )
    await db.execute(
        update(FairPlayCheck)
        .where(FairPlayCheck.game_id == game_id)
        .values(status=CheckStatus.DONE, checked_at=now)
    )
    await db.commit()
    return list(players.values())


# ── The window, the confirmation and the report ───────────────────────────


@dataclass(frozen=True)
class Checked:
    """One screened game of a player's, as plain values (they outlive any rollback)."""

    game_id: uuid.UUID
    side: str
    figures: Figures
    think_median_ms: int
    think_spread: float
    fast_moves: int
    checked_at: datetime


def _figures(row: FairPlaySide) -> Figures:
    return Figures(
        moves=row.moves,
        decisive=row.decisive,
        agreed=row.agreed,
        decisive_loss=row.decisive_loss,
        mistakes=row.mistakes,
        blunders=row.blunders,
    )


def total(figures: Iterable[Figures]) -> Figures:
    return sum(figures, Figures())


async def window(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> list[Checked]:
    """The player's latest screened games, newest first."""
    rows = await db.scalars(
        select(FairPlaySide)
        .where(
            FairPlaySide.user_id == user_id,
            FairPlaySide.stage == Stage.SCREEN,
            FairPlaySide.created_at >= now - timedelta(days=t.WINDOW_DAYS),
        )
        .order_by(FairPlaySide.created_at.desc(), FairPlaySide.game_id)
        .limit(t.WINDOW_GAMES)
    )
    return [
        Checked(
            game_id=r.game_id,
            side=r.side,
            figures=_figures(r),
            think_median_ms=r.think_median_ms,
            think_spread=r.think_spread,
            fast_moves=r.fast_moves,
            checked_at=r.created_at,
        )
        for r in rows
    ]


async def confirmations(
    db: AsyncSession, user_id: uuid.UUID, game_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, Figures]:
    """The deep reviews already done for these games of the player's."""
    rows = await db.scalars(
        select(FairPlaySide).where(
            FairPlaySide.user_id == user_id,
            FairPlaySide.stage == Stage.CONFIRM,
            FairPlaySide.game_id.in_(game_ids),
        )
    )
    return {r.game_id: _figures(r) for r in rows}


async def _cooling_down(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> bool:
    """Whether a moderator dismissed an automatic report about this player recently (and not
    enough games have been checked since to look again)."""
    dismissed = await db.scalar(
        select(Report.resolved_at)
        .where(
            Report.target_id == user_id,
            Report.reporter_id.is_(None),
            Report.status == ReportStatus.DISMISSED,
        )
        .order_by(Report.resolved_at.desc())
        .limit(1)
    )
    if dismissed is None or dismissed < now - t.AUTO_REPORT_COOLDOWN:
        return False
    since = await db.scalars(
        select(FairPlaySide.game_id).where(
            FairPlaySide.user_id == user_id,
            FairPlaySide.stage == Stage.SCREEN,
            FairPlaySide.created_at > dismissed,
        )
    )
    return len(since.all()) < t.COOLDOWN_GAMES


def _percent(x: float) -> str:
    return f"{x * 100:.1f}%"


def describe(
    screen_figures: Figures, confirm_figures: Figures | None, games: int, think: int
) -> str:
    """The automatic report's text: the numbers a moderator needs."""

    def line(name: str, f: Figures) -> str:
        return (
            f"{name}: {f.decisive} decisive positions, engine's move {_percent(f.agreement)}, "
            f"average loss {f.average_loss:.0f}, mistakes {_percent(f.mistake_rate)} of "
            f"{f.moves} moves."
        )

    return " ".join(
        [
            f"Automatic fair-play check over the player's last {games} rated games.",
            line("Quick review", screen_figures),
            line("Deep review", confirm_figures)
            if confirm_figures is not None
            else "No deep review: the quick review alone matched a shallow engine move for move.",
            f"Median think time {think / 1000:.1f} s.",
            "This is a reason to look, not proof: compare with the games themselves.",
        ]
    )


async def evaluate(
    db: AsyncSession,
    review: Reviewer,
    user_id: uuid.UUID,
    now: datetime,
    heartbeat: Heartbeat,
) -> bool:
    """Judge a player's window after a new game was screened; returns whether it filed an
    automatic report. Two ways to be reported: play matching the quick review's shallow engine
    move for move, or play that earns a deep review and matches a strong engine there too."""
    if await db.scalar(select(Report.id).where(Report.open_key == auto_report_key(user_id))):
        return False  # one is already waiting for a moderator
    rows = await window(db, user_id, now)
    if len(rows) < t.MIN_GAMES or await _cooling_down(db, user_id, now):
        return False
    screened = total(r.figures for r in rows)
    deep = None
    if not t.EXACT_BAR.passed(screened):
        if not t.SCREEN_BAR.passed(screened):
            return False
        deep = await _confirm(db, review, user_id=user_id, rows=rows, heartbeat=heartbeat, now=now)
        if not t.CONFIRM_BAR.passed(deep):
            return False
    return await _report(db, user_id=user_id, rows=rows, screened=screened, deep=deep, now=now)


async def _confirm(  # noqa: PLR0913 - the whole confirmation
    db: AsyncSession,
    review: Reviewer,
    *,
    user_id: uuid.UUID,
    rows: Sequence[Checked],
    heartbeat: Heartbeat,
    now: datetime,
) -> Figures:
    """The deep review of the player's moves in the window's games (each game once: earlier
    confirmations are kept)."""
    done = await confirmations(db, user_id, [r.game_id for r in rows])
    for r in rows:
        if r.game_id in done:
            continue
        game = await games.get_game(db, r.game_id)
        found = await review(
            await games.move_list(db, game), t.CONFIRM_DEPTH, t.CONFIRM_SECONDS, r.side
        )
        db.add(
            FairPlaySide(
                game_id=r.game_id,
                user_id=user_id,
                stage=Stage.CONFIRM,
                side=r.side,
                **found[r.side],
                think_median_ms=r.think_median_ms,
                think_spread=r.think_spread,
                fast_moves=r.fast_moves,
                created_at=now,
            )
        )
        try:
            await db.commit()
        except IntegrityError:  # another server confirmed the same game meanwhile
            await db.rollback()
            done = await confirmations(db, user_id, [x.game_id for x in rows])
        else:
            done[r.game_id] = Figures(**found[r.side])
        await heartbeat()
    return total(done[r.game_id] for r in rows)


async def _report(  # noqa: PLR0913 - the whole report
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    rows: Sequence[Checked],
    screened: Figures,
    deep: Figures | None,
    now: datetime,
) -> bool:
    """File the automatic report (at most one open per player)."""
    think = int(statistics.median(r.think_median_ms for r in rows))
    db.add(
        Report(
            reporter_id=None,
            target_id=user_id,
            game_id=rows[0].game_id,
            reason=ReportReason.CHEATING,
            details=describe(screened, deep, len(rows), think),
            status=ReportStatus.OPEN,
            open_key=auto_report_key(user_id),
            created_at=now,
        )
    )
    try:
        await db.commit()
    except IntegrityError:  # another server filed it at the same moment
        await db.rollback()
        return False
    return True
