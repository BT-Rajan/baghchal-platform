"""Achievements are worked out, never stored: each comes from the games or daily puzzles that
earned it, so they can never disagree with them, and its date is that game's or day's."""

import uuid
from datetime import UTC, datetime, time
from typing import Final

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.achievements.schemas import Achievement, AchievementOut
from baghchal_server.games.models import EndReason, Game
from baghchal_server.trainer import service as trainer

RATED_GAMES: Final = 10
PUZZLE_DAYS: Final = 7


def _won(user_id: uuid.UUID, side: str | None = None) -> ColumnElement[bool]:
    as_goat = and_(Game.goat_id == user_id, Game.winner == "goat")
    as_tiger = and_(Game.tiger_id == user_id, Game.winner == "tiger")
    if side == "goat":
        return as_goat
    if side == "tiger":
        return as_tiger
    return or_(as_goat, as_tiger)


async def _first(db: AsyncSession, *conditions: ColumnElement[bool]) -> datetime | None:
    return await db.scalar(select(func.min(Game.finished_at)).where(*conditions))


async def of(db: AsyncSession, user_id: uuid.UUID) -> list[AchievementOut]:
    """Every achievement, in a fixed order, with when the player earned it (or None)."""
    earned: dict[Achievement, datetime | None] = {
        Achievement.FIRST_WIN: await _first(db, _won(user_id)),
        Achievement.GOAT_WIN: await _first(db, _won(user_id, "goat")),
        Achievement.TIGER_WIN: await _first(db, _won(user_id, "tiger")),
        Achievement.TRAPPED: await _first(
            db, _won(user_id, "goat"), Game.end_reason == EndReason.TIGERS_TRAPPED
        ),
        Achievement.FIVE_CAPTURES: await _first(
            db, _won(user_id, "tiger"), Game.end_reason == EndReason.FIVE_CAPTURED
        ),
        Achievement.BEAT_MEDIUM: await _first(db, _won(user_id), Game.bot_level == "medium"),
        Achievement.BEAT_HARD: await _first(db, _won(user_id), Game.bot_level == "hard"),
        Achievement.RATED_10: await db.scalar(
            select(Game.finished_at)
            .where(
                or_(Game.goat_id == user_id, Game.tiger_id == user_id),
                Game.rated,
                Game.winner.is_not(None),
            )
            .order_by(Game.finished_at)
            .offset(RATED_GAMES - 1)
            .limit(1)
        ),
    }
    streak = trainer.first_streak(await trainer.daily_firsts(db, user_id), PUZZLE_DAYS)
    earned[Achievement.PUZZLE_STREAK_7] = (
        None if streak is None else datetime.combine(streak, time(), UTC)
    )
    return [AchievementOut(key=key, earned_at=earned[key]) for key in Achievement]
