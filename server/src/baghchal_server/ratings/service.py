"""Ratings: reading them as of now, updating them after rated games, and leaderboards."""

import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Final

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import User
from baghchal_server.accounts.service import in_good_standing
from baghchal_server.lobby.time_controls import Category
from baghchal_server.ratings import glicko2
from baghchal_server.ratings.models import PlayerRating

RATING_PERIOD: Final = timedelta(days=1)
"""How much idle time widens a deviation by one Glicko-2 period."""
PROVISIONAL_DEVIATION: Final = 110.0
"""Above this the rating is still settling: shown with a "?" and kept off leaderboards."""
LEADERBOARD_ACTIVE: Final = timedelta(days=30)


def as_of(row: PlayerRating | None, now: datetime) -> glicko2.Rating:
    """The rating as it stands at ``now``, its deviation widened for the idle time."""
    if row is None:
        return glicko2.Rating()
    stored = glicko2.Rating(row.rating, row.deviation, row.volatility)
    return glicko2.idle(stored, (now - row.updated_at) / RATING_PERIOD)


def is_provisional(rating: glicko2.Rating) -> bool:
    return rating.deviation > PROVISIONAL_DEVIATION


async def rows_of(db: AsyncSession, user_id: uuid.UUID) -> dict[Category, PlayerRating]:
    rows = await db.scalars(select(PlayerRating).where(PlayerRating.user_id == user_id))
    return {Category(r.category): r for r in rows}


async def current(
    db: AsyncSession, user_ids: Sequence[uuid.UUID], category: Category, now: datetime
) -> dict[uuid.UUID, glicko2.Rating]:
    rows = await db.scalars(
        select(PlayerRating).where(
            PlayerRating.user_id.in_(user_ids), PlayerRating.category == category
        )
    )
    found = {r.user_id: r for r in rows}
    return {uid: as_of(found.get(uid), now) for uid in user_ids}


async def record_game(
    db: AsyncSession,
    category: Category,
    winner_id: uuid.UUID,
    loser_id: uuid.UUID,
    now: datetime,
) -> tuple[glicko2.Rating, glicko2.Rating, glicko2.Rating, glicko2.Rating]:
    """Rate a finished game (caller commits). Returns winner and loser before and after.

    Both players are rated against the other's rating from before the game. A player is in
    at most one live game, so their rating rows are never updated concurrently.
    """
    rows = {
        r.user_id: r
        for r in await db.scalars(
            select(PlayerRating).where(
                PlayerRating.user_id.in_([winner_id, loser_id]),
                PlayerRating.category == category,
            )
        )
    }
    winner_before = as_of(rows.get(winner_id), now)
    loser_before = as_of(rows.get(loser_id), now)
    winner_after = glicko2.rate(winner_before, [glicko2.Result(loser_before, 1.0)])
    loser_after = glicko2.rate(loser_before, [glicko2.Result(winner_before, 0.0)])
    for user_id, after in ((winner_id, winner_after), (loser_id, loser_after)):
        row = rows.get(user_id)
        if row is None:
            row = PlayerRating(user_id=user_id, category=category, games=0)
            db.add(row)
        row.rating, row.deviation, row.volatility = after.rating, after.deviation, after.volatility
        row.games += 1
        row.updated_at = now
    await db.flush()  # visible to later reads in this transaction (a match's next game)
    return winner_before, winner_after, loser_before, loser_after


async def leaderboard(
    db: AsyncSession, category: Category, now: datetime, limit: int
) -> list[tuple[str, PlayerRating]]:
    """Established, recently active, active accounts, best first."""
    rows = await db.execute(
        select(User.username, PlayerRating)
        .join(User, User.id == PlayerRating.user_id)
        .where(
            PlayerRating.category == category,
            PlayerRating.deviation <= PROVISIONAL_DEVIATION,
            PlayerRating.updated_at >= now - LEADERBOARD_ACTIVE,
            in_good_standing(now),
        )
        .order_by(PlayerRating.rating.desc(), User.username_key)
        .limit(limit)
    )
    return [(name, rating) for name, rating in rows.all()]


async def rank_of(db: AsyncSession, row: PlayerRating, now: datetime) -> int | None:
    """The player's place on the leaderboard, or None if they are not on it."""
    if row.deviation > PROVISIONAL_DEVIATION or row.updated_at < now - LEADERBOARD_ACTIVE:
        return None
    better = await db.scalar(
        select(func.count())
        .select_from(PlayerRating)
        .join(User, User.id == PlayerRating.user_id)
        .where(
            PlayerRating.category == row.category,
            PlayerRating.deviation <= PROVISIONAL_DEVIATION,
            PlayerRating.updated_at >= now - LEADERBOARD_ACTIVE,
            in_good_standing(now),
            PlayerRating.rating > row.rating,
        )
    )
    return (better or 0) + 1
