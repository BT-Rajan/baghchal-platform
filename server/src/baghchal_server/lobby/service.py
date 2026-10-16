"""Players and challenges."""

import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Final, Literal

from sqlalchemy import ColumnElement, and_, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import User
from baghchal_server.errors import AppError
from baghchal_server.games import service as games
from baghchal_server.games.models import Game
from baghchal_server.lobby.models import Challenge, ChallengeStatus
from baghchal_server.lobby.schemas import ChallengeIn, ChallengeOut, PlayerOut
from baghchal_server.lobby.time_controls import TIME_CONTROLS
from baghchal_server.realtime.presence import Presence

CHALLENGE_TTL: Final = timedelta(seconds=60)
MAX_OUTGOING_CHALLENGES: Final = 5
Response = Literal["accept", "decline", "cancel"]

_RESULT: Final = {
    "accept": ChallengeStatus.ACCEPTED,
    "decline": ChallengeStatus.DECLINED,
    "cancel": ChallengeStatus.CANCELLED,
}


def _playable() -> ColumnElement[bool]:
    """Condition for a user who can be found and challenged."""
    return and_(User.is_active.is_(True), User.email_verified_at.is_not(None))


def pair_key(a: uuid.UUID, b: uuid.UUID) -> str:
    return ":".join(sorted((str(a), str(b))))


# ── Players ───────────────────────────────────────────────────────────────


async def find_player(db: AsyncSession, username: str) -> User | None:
    return await db.scalar(select(User).where(User.username_key == username.lower(), _playable()))


async def search_players(db: AsyncSession, prefix: str, limit: int) -> Sequence[User]:
    # "_" is a LIKE wildcard and may appear in usernames, so escape it.
    pattern = prefix.lower().replace("\\", "\\\\").replace("_", "\\_") + "%"
    return (
        await db.scalars(
            select(User)
            .where(User.username_key.like(pattern, escape="\\"), _playable())
            .order_by(User.username_key)
            .limit(limit)
        )
    ).all()


async def users_by_id(db: AsyncSession, ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, User]:
    if not ids:
        return {}
    rows = await db.scalars(select(User).where(User.id.in_(ids), _playable()))
    return {u.id: u for u in rows}


# ── Challenges ────────────────────────────────────────────────────────────


async def create_challenge(
    db: AsyncSession, presence: Presence, now: datetime, challenger: User, data: ChallengeIn
) -> Challenge:
    opponent = await find_player(db, data.opponent)
    if opponent is None:
        raise AppError(404, "player_not_found", "No such player.")
    if opponent.id == challenger.id:
        raise AppError(422, "cannot_challenge_self", "You cannot challenge yourself.")
    if not await presence.online([opponent.id]):
        raise AppError(409, "player_offline", f"{opponent.username} is not online.")
    if await games.busy(db, [challenger.id, opponent.id]):
        raise _busy()
    outgoing = await db.scalar(
        select(func.count())
        .select_from(Challenge)
        .where(
            Challenge.challenger_id == challenger.id,
            Challenge.status == ChallengeStatus.PENDING,
            Challenge.expires_at > now,
        )
    )
    if outgoing is not None and outgoing >= MAX_OUTGOING_CHALLENGES:
        raise AppError(
            429, "too_many_challenges", "Wait for a reply before sending more challenges."
        )

    key = pair_key(challenger.id, opponent.id)
    # A lapsed challenge between the two still holds the pair; release it first.
    await db.execute(
        update(Challenge)
        .where(Challenge.pair_key == key, Challenge.expires_at <= now)
        .values(status=ChallengeStatus.EXPIRED, pair_key=None)
    )
    tc = TIME_CONTROLS[data.time_control]
    challenge = Challenge(
        id=uuid.uuid4(),
        challenger_id=challenger.id,
        opponent_id=opponent.id,
        pair_key=key,
        initial_seconds=tc.initial_seconds,
        increment_seconds=tc.increment_seconds,
        rated=data.rated,
        challenger_side=data.side,
        status=ChallengeStatus.PENDING,
        created_at=now,
        expires_at=now + CHALLENGE_TTL,
    )
    db.add(challenge)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise AppError(
            409, "challenge_exists", "There is already an open challenge between you."
        ) from None
    return challenge


async def respond(
    db: AsyncSession, now: datetime, user_id: uuid.UUID, challenge_id: uuid.UUID, response: Response
) -> tuple[Challenge, Game | None]:
    """Accept or decline (the opponent) or cancel (the challenger) a pending challenge.

    One conditional UPDATE decides, so of two racing responses exactly one wins. Accepting
    starts the game in the same transaction: there is never an accepted challenge without one.
    """
    actor = Challenge.challenger_id if response == "cancel" else Challenge.opponent_id
    result = await db.execute(
        update(Challenge)
        .where(
            Challenge.id == challenge_id,
            actor == user_id,
            Challenge.status == ChallengeStatus.PENDING,
            Challenge.expires_at > now,
        )
        .values(status=_RESULT[response], pair_key=None, responded_at=now)
    )
    if result.rowcount == 1:  # type: ignore[attr-defined]
        challenge = await db.get(Challenge, challenge_id, populate_existing=True)
        assert challenge is not None  # noqa: S101 - just updated
        game = None
        if response == "accept":
            players = [challenge.challenger_id, challenge.opponent_id]
            try:
                game = await games.start_game(db, challenge, now)
            except IntegrityError:
                await db.rollback()
                if await games.busy(db, players):
                    raise _busy() from None
                raise
        await db.commit()
        return challenge, game
    await db.rollback()
    challenge = await db.get(Challenge, challenge_id)
    if challenge is None or user_id not in (challenge.challenger_id, challenge.opponent_id):
        raise AppError(404, "challenge_not_found", "No such challenge.")
    if (response == "cancel") != (user_id == challenge.challenger_id):
        raise AppError(403, "not_allowed", f"You cannot {response} this challenge.")
    raise AppError(409, "challenge_closed", "This challenge is no longer open.")


def _busy() -> AppError:
    return AppError(409, "player_busy", "One of you is already playing a game.")


async def open_challenges(db: AsyncSession, now: datetime, user: User) -> Sequence[Challenge]:
    return (
        await db.scalars(
            select(Challenge)
            .where(
                or_(Challenge.challenger_id == user.id, Challenge.opponent_id == user.id),
                Challenge.status == ChallengeStatus.PENDING,
                Challenge.expires_at > now,
            )
            .order_by(Challenge.created_at)
        )
    ).all()


async def describe(db: AsyncSession, challenges: Sequence[Challenge]) -> list[ChallengeOut]:
    ids = {c.challenger_id for c in challenges} | {c.opponent_id for c in challenges}
    rows = await db.execute(select(User.id, User.username).where(User.id.in_(ids)))
    names = dict(rows.all())
    game_ids = dict(
        (
            await db.execute(
                select(Game.challenge_id, Game.id).where(
                    Game.challenge_id.in_([c.id for c in challenges])
                )
            )
        ).all()
    )
    return [
        ChallengeOut(
            id=c.id,
            challenger=PlayerOut(id=c.challenger_id, username=names[c.challenger_id]),
            opponent=PlayerOut(id=c.opponent_id, username=names[c.opponent_id]),
            time_control=f"{c.initial_seconds // 60}+{c.increment_seconds}",
            rated=c.rated,
            side=c.challenger_side,
            status=ChallengeStatus(c.status),
            created_at=c.created_at,
            expires_at=c.expires_at,
            game_id=game_ids.get(c.id),
        )
        for c in challenges
    ]
