"""Post-game analysis: the engine's review of a finished game (a Plus and Pro feature).

A game is analysed once and kept; anyone with the feature can then read it. Working out a new
analysis counts against the player's daily allowance (Plus: 5 a day; Pro, or the feature granted
on its own: no limit). Live games are never analysed, so the engine cannot help anyone mid-game.
"""

import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.billing import service as billing
from baghchal_server.billing.plans import ANALYSES_PER_DAY, Feature
from baghchal_server.errors import AppError
from baghchal_server.games import service
from baghchal_server.games.models import Analysis, AnalysisUse, GameStatus
from baghchal_server.games.schemas import AnalysisOut, MoveReviewOut

WHAT = "Game analysis"

Reviewer = Callable[[list[str]], Awaitable[list[dict[str, object]]]]
"""Works out a review from a game's moves (in a worker process, in the server)."""


async def _allowance(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> int | None:
    """Analyses of new games left today (UTC), or None for no limit."""
    found = await billing.require(db, user_id, now, Feature.ANALYSIS, WHAT)
    daily = None if Feature.ANALYSIS in found.granted else ANALYSES_PER_DAY[found.plan]
    if daily is None:
        return None
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    used = await db.scalar(
        select(func.count())
        .select_from(AnalysisUse)
        .where(AnalysisUse.user_id == user_id, AnalysisUse.created_at >= today)
    )
    return max(0, daily - (used or 0))


def _out(analysis: Analysis, left: int | None) -> AnalysisOut:
    return AnalysisOut(
        game_id=analysis.game_id,
        moves=[MoveReviewOut.model_validate(m) for m in analysis.moves],
        created_at=analysis.created_at,
        left_today=left,
    )


async def read(
    db: AsyncSession, user_id: uuid.UUID, game_id: uuid.UUID, now: datetime
) -> AnalysisOut:
    left = await _allowance(db, user_id, now)
    analysis = await db.get(Analysis, game_id)
    if analysis is None:
        raise AppError(404, "not_analysed", "This game has not been analysed yet.")
    return _out(analysis, left)


async def analyse(
    db: AsyncSession,
    user_id: uuid.UUID,
    game_id: uuid.UUID,
    now: datetime,
    review: Reviewer,
) -> AnalysisOut:
    """The game's analysis, working it out (and counting it) if nobody has yet."""
    left = await _allowance(db, user_id, now)
    game = await service.get_game(db, game_id)
    if game.status != GameStatus.FINISHED:
        raise AppError(409, "game_not_finished", "Only finished games can be analysed.")
    analysis = await db.get(Analysis, game_id)
    if analysis is not None:
        return _out(analysis, left)
    if left == 0:
        raise AppError(
            429,
            "analysis_limit",
            "You have used today's analyses. More tomorrow, or no limit with ClawPlay Pro.",
        )
    moves = await review(await service.move_list(db, game))
    analysis = Analysis(game_id=game_id, moves=moves, created_at=now)
    db.add(analysis)
    db.add(AnalysisUse(user_id=user_id, game_id=game_id, created_at=now))
    try:
        await db.commit()
    except IntegrityError:  # someone else analysed it at the same moment
        await db.rollback()
        analysis = await db.get(Analysis, game_id)
        assert analysis is not None  # noqa: S101 - it is what the conflict was about
        return _out(analysis, left)
    return _out(analysis, None if left is None else left - 1)
