"""Quick pairing: "play anyone who wants the same kind of game".

A player asks for a time control, rated or casual. If someone compatible is already waiting,
the two are paired at once, longest-waiting first; otherwise the request waits (``SEEK_TTL``)
for the next person who asks. Compatible means: online, not blocked either way, not playing,
not barred by the abort penalty and, for rated games, allowed a rated match against each other
today. A pairing goes through an accepted challenge, so rated games are two-game matches as
usual.

Claiming the other player's seek is a conditional delete, so of two requests racing for the
same partner exactly one wins; the loser simply tries the next.
"""

import uuid
from datetime import datetime, timedelta
from typing import Final, Literal

from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import User
from baghchal_server.games import service as games
from baghchal_server.games.models import Game
from baghchal_server.games.schemas import GameOut
from baghchal_server.lobby.models import Challenge, ChallengeStatus, Seek
from baghchal_server.lobby.schemas import TimeControlLabel
from baghchal_server.lobby.service import (
    RATED_MATCH_EVERY,
    busy_error,
    check_abort_cooldown,
    hidden_from,
)
from baghchal_server.lobby.time_controls import TIME_CONTROLS
from baghchal_server.realtime.presence import Presence

SEEK_TTL: Final = timedelta(minutes=2)
CANDIDATES: Final = 20


class SeekIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    time_control: TimeControlLabel
    rated: bool = False


class SeekOut(BaseModel):
    status: Literal["paired", "waiting"]
    game: GameOut | None
    """The game, when paired at once. Someone who was waiting hears of it as a game event."""
    expires_at: datetime | None
    """While waiting: when the request lapses (ask again to keep looking)."""


class SeekCountOut(BaseModel):
    time_control: str
    rated: bool
    players: int
    """How many are waiting for this kind of game right now."""


async def seek(  # noqa: PLR0913 - who wants which game, and where to look
    db: AsyncSession,
    presence: Presence,
    now: datetime,
    user: User,
    time_control: str,
    *,
    rated: bool,
) -> tuple[Game | None, datetime]:
    """Pair ``user`` now if possible (returns the game), or leave them waiting. Also returns
    when the wait ends."""
    user_id = user.id  # a rollback below expires ``user``
    if await games.busy(db, [user_id]):
        raise busy_error()
    await check_abort_cooldown(db, user_id, now)
    tc = TIME_CONTROLS[time_control]
    # Start afresh: a new request replaces this player's old one; lapsed ones go too.
    await db.execute(delete(Seek).where((Seek.user_id == user_id) | (Seek.expires_at <= now)))
    await db.commit()

    waiting = (
        await db.scalars(
            select(Seek)
            .where(
                Seek.initial_seconds == tc.initial_seconds,
                Seek.increment_seconds == tc.increment_seconds,
                Seek.rated.is_(rated),
                Seek.expires_at > now,
            )
            .order_by(Seek.created_at)
            .limit(CANDIDATES)
        )
    ).all()
    others = [s.user_id for s in waiting]
    hidden = await hidden_from(db, user_id)
    online = await presence.online(others)
    playing = await games.busy(db, others)
    for candidate in others:
        if candidate in hidden or candidate not in online or candidate in playing:
            continue
        if await games.abort_cooldown(db, candidate, now) > timedelta(0):
            continue
        if rated:
            last = await games.last_rated_match(db, user_id, candidate)
            if last is not None and now - last < RATED_MATCH_EVERY:
                continue
        game = await _pair(
            db,
            now,
            candidate,
            user_id,
            initial_seconds=tc.initial_seconds,
            increment_seconds=tc.increment_seconds,
            rated=rated,
        )
        if game is not None:
            return game, now

    expires = now + SEEK_TTL
    db.add(
        Seek(
            user_id=user_id,
            initial_seconds=tc.initial_seconds,
            increment_seconds=tc.increment_seconds,
            rated=rated,
            created_at=now,
            expires_at=expires,
        )
    )
    try:
        await db.commit()
    except IntegrityError:  # the same player asked twice at once: one wait is enough
        await db.rollback()
    return None, expires


async def _pair(  # noqa: PLR0913 - the two players and the game they want
    db: AsyncSession,
    now: datetime,
    waiting: uuid.UUID,
    arriving: uuid.UUID,
    *,
    initial_seconds: int,
    increment_seconds: int,
    rated: bool,
) -> Game | None:
    """Claim ``waiting``'s seek and start their game against ``arriving``; None when someone
    else got there first."""
    claimed = await db.execute(delete(Seek).where(Seek.user_id == waiting, Seek.expires_at > now))
    if claimed.rowcount != 1:  # type: ignore[attr-defined]
        await db.rollback()
        return None
    challenge = Challenge(
        id=uuid.uuid4(),
        challenger_id=waiting,
        opponent_id=arriving,
        pair_key=None,
        initial_seconds=initial_seconds,
        increment_seconds=increment_seconds,
        rated=rated,
        challenger_side=None if rated else "random",
        status=ChallengeStatus.ACCEPTED,
        created_at=now,
        expires_at=now,
        responded_at=now,
    )
    db.add(challenge)
    try:
        await db.flush()  # before the game, which refers to it
        game = await games.start_game(db, challenge, now)
        await db.commit()
    except (IntegrityError, OperationalError):
        # One of the two started another game meanwhile (or, on MySQL, the database chose
        # this transaction to break a deadlock with a racing pairing): no pairing.
        await db.rollback()
        return None
    return game


async def cancel(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(delete(Seek).where(Seek.user_id == user_id))
    await db.commit()


async def counts(db: AsyncSession, now: datetime) -> list[tuple[int, int, bool, int]]:
    """How many players are waiting for each kind of game: (initial, increment, rated, n)."""
    rows = await db.execute(
        select(Seek.initial_seconds, Seek.increment_seconds, Seek.rated, func.count())
        .where(Seek.expires_at > now)
        .group_by(Seek.initial_seconds, Seek.increment_seconds, Seek.rated)
        .order_by(Seek.initial_seconds, Seek.increment_seconds, Seek.rated)
    )
    return [(a, b, bool(c), n) for a, b, c, n in rows.all()]
