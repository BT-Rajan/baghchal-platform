"""Players and challenges."""

import math
import secrets
import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Final, Literal

from sqlalchemy import ColumnElement, and_, delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import User
from baghchal_server.accounts.service import BOT_ROLE, in_good_standing
from baghchal_server.errors import AppError
from baghchal_server.friends.models import Friendship
from baghchal_server.games import service as games
from baghchal_server.games.models import Game
from baghchal_server.lobby.models import Block, Challenge, ChallengeStatus
from baghchal_server.lobby.schemas import ChallengeIn, ChallengeOut, PlayerOut
from baghchal_server.lobby.time_controls import TIME_CONTROLS, label_of
from baghchal_server.notifications.models import Notification
from baghchal_server.realtime.presence import Presence

CHALLENGE_TTL: Final = timedelta(seconds=60)
LINK_TTL: Final = timedelta(days=1)
"""How long a challenge by link stays open: friends answer when they see the message."""
MAX_OUTGOING_CHALLENGES: Final = 5
RATED_MATCH_EVERY: Final = timedelta(hours=24)
"""Two players may start one rated match per this long, so ratings cannot be farmed between
friends or between someone's own accounts. Casual games are not limited."""
Response = Literal["accept", "decline", "cancel"]

_RESULT: Final = {
    "accept": ChallengeStatus.ACCEPTED,
    "decline": ChallengeStatus.DECLINED,
    "cancel": ChallengeStatus.CANCELLED,
}


def _playable(now: datetime) -> ColumnElement[bool]:
    """Condition for a user who can be found and challenged: verified, not deleted, not
    suspended."""
    return and_(
        in_good_standing(now),
        User.email_verified_at.is_not(None),
        User.role != BOT_ROLE,  # the computer is played from its own menu, not challenged
    )


def pair_key(a: uuid.UUID, b: uuid.UUID) -> str:
    return ":".join(sorted((str(a), str(b))))


# ── Players ───────────────────────────────────────────────────────────────


async def find_player(db: AsyncSession, username: str, now: datetime) -> User | None:
    return await db.scalar(
        select(User).where(User.username_key == username.lower(), _playable(now))
    )


async def search_players(
    db: AsyncSession, prefix: str, limit: int, viewer_id: uuid.UUID, now: datetime
) -> Sequence[User]:
    """Players whose username starts with ``prefix``, leaving out anyone the viewer has
    blocked or who has blocked the viewer."""
    # "_" is a LIKE wildcard and may appear in usernames, so escape it.
    pattern = prefix.lower().replace("\\", "\\\\").replace("_", "\\_") + "%"
    return (
        await db.scalars(
            select(User)
            .where(
                User.username_key.like(pattern, escape="\\"),
                _playable(now),
                User.id.not_in(select(Block.blocked_id).where(Block.blocker_id == viewer_id)),
                User.id.not_in(select(Block.blocker_id).where(Block.blocked_id == viewer_id)),
            )
            .order_by(User.username_key)
            .limit(limit)
        )
    ).all()


# ── Blocking ──────────────────────────────────────────────────────────────


async def hidden_from(db: AsyncSession, viewer_id: uuid.UUID) -> set[uuid.UUID]:
    """Players the viewer has blocked or who have blocked the viewer: left out of each other's
    lists of players."""
    rows = await db.execute(
        select(Block.blocker_id, Block.blocked_id).where(
            or_(Block.blocker_id == viewer_id, Block.blocked_id == viewer_id)
        )
    )
    return {blocked if blocker == viewer_id else blocker for blocker, blocked in rows.all()}


async def has_blocked(db: AsyncSession, blocker_id: uuid.UUID, blocked_id: uuid.UUID) -> bool:
    return await db.get(Block, (blocker_id, blocked_id)) is not None


async def blocked_players(db: AsyncSession, blocker_id: uuid.UUID) -> Sequence[User]:
    return (
        await db.scalars(
            select(User)
            .join(Block, Block.blocked_id == User.id)
            .where(Block.blocker_id == blocker_id)
            .order_by(User.username_key)
        )
    ).all()


async def block(
    db: AsyncSession, now: datetime, blocker_id: uuid.UUID, blocked_id: uuid.UUID
) -> Sequence[Challenge]:
    """Block a player (again is fine), closing any open challenge between the two: declined
    if it was for the blocker, cancelled if it was theirs. Returns the challenges closed."""
    if blocker_id == blocked_id:
        raise AppError(422, "cannot_block_self", "You cannot block yourself.")
    # A block ends any friendship or friend request between the two, and clears what the
    # blocked player's notifications told the blocker.
    await db.execute(
        delete(Friendship).where(Friendship.pair_key == pair_key(blocker_id, blocked_id))
    )
    await db.execute(
        delete(Notification).where(
            Notification.user_id == blocker_id, Notification.actor_id == blocked_id
        )
    )
    if not await has_blocked(db, blocker_id, blocked_id):
        db.add(Block(blocker_id=blocker_id, blocked_id=blocked_id, created_at=now))
        try:
            await db.flush()
        except IntegrityError:  # blocked twice at once: the other request did it
            await db.rollback()
    key = pair_key(blocker_id, blocked_id)
    open_challenges = (
        await db.scalars(
            select(Challenge).where(
                Challenge.pair_key == key, Challenge.status == ChallengeStatus.PENDING
            )
        )
    ).all()
    for challenge in open_challenges:
        challenge.status = (
            ChallengeStatus.DECLINED
            if challenge.opponent_id == blocker_id
            else ChallengeStatus.CANCELLED
        )
        challenge.pair_key = None
        challenge.responded_at = now
    await db.commit()
    return open_challenges


async def close_open_challenges(
    db: AsyncSession, user_id: uuid.UUID, now: datetime
) -> Sequence[Challenge]:
    """Close every pending challenge the player sent (cancelled) or received (declined), when
    their account is deleted or suspended. The caller commits and tells the other players."""
    challenges = (
        await db.scalars(
            select(Challenge).where(
                or_(Challenge.challenger_id == user_id, Challenge.opponent_id == user_id),
                Challenge.status == ChallengeStatus.PENDING,
            )
        )
    ).all()
    for challenge in challenges:
        challenge.status = (
            ChallengeStatus.CANCELLED
            if challenge.challenger_id == user_id
            else ChallengeStatus.DECLINED
        )
        challenge.pair_key = None
        challenge.responded_at = now
    return challenges


async def unblock(db: AsyncSession, blocker_id: uuid.UUID, blocked_id: uuid.UUID) -> None:
    await db.execute(
        delete(Block).where(Block.blocker_id == blocker_id, Block.blocked_id == blocked_id)
    )
    await db.commit()


async def users_by_id(
    db: AsyncSession, ids: Sequence[uuid.UUID], now: datetime
) -> dict[uuid.UUID, User]:
    if not ids:
        return {}
    rows = await db.scalars(select(User).where(User.id.in_(ids), _playable(now)))
    return {u.id: u for u in rows}


# ── Challenges ────────────────────────────────────────────────────────────


async def _check_outgoing(db: AsyncSession, challenger_id: uuid.UUID, now: datetime) -> None:
    outgoing = await db.scalar(
        select(func.count())
        .select_from(Challenge)
        .where(
            Challenge.challenger_id == challenger_id,
            Challenge.status == ChallengeStatus.PENDING,
            Challenge.expires_at > now,
        )
    )
    if outgoing is not None and outgoing >= MAX_OUTGOING_CHALLENGES:
        raise AppError(
            429, "too_many_challenges", "Wait for a reply before sending more challenges."
        )


async def _link_challenge(
    db: AsyncSession, now: datetime, challenger: User, data: ChallengeIn
) -> Challenge:
    """A casual challenge for whoever opens its link first, open for a day."""
    await check_abort_cooldown(db, challenger.id, now)
    await _check_outgoing(db, challenger.id, now)
    tc = TIME_CONTROLS[data.time_control]
    challenge = Challenge(
        id=uuid.uuid4(),
        challenger_id=challenger.id,
        code=secrets.token_urlsafe(6),
        initial_seconds=tc.initial_seconds,
        increment_seconds=tc.increment_seconds,
        rated=False,
        challenger_side=data.side,
        status=ChallengeStatus.PENDING,
        created_at=now,
        expires_at=now + LINK_TTL,
    )
    db.add(challenge)
    await db.commit()
    return challenge


async def create_challenge(
    db: AsyncSession, presence: Presence, now: datetime, challenger: User, data: ChallengeIn
) -> Challenge:
    """Challenge a named player who is online now, or (no opponent) anyone with the link."""
    if data.opponent is None:
        return await _link_challenge(db, now, challenger, data)
    opponent = await find_player(db, data.opponent, now)
    if opponent is None:
        raise AppError(404, "player_not_found", "No such player.")
    if opponent.id == challenger.id:
        raise AppError(422, "cannot_challenge_self", "You cannot challenge yourself.")
    if data.rated and opponent.role == "guest":
        raise AppError(
            409,
            "guest_plays_casual",
            "{name} is a guest and plays casual games only.",
            name=opponent.username,
        )
    # Before anything that would tell a blocked player whether the other is online.
    if await has_blocked(db, challenger.id, opponent.id):
        raise AppError(
            403,
            "player_blocked",
            "You have blocked {name}. Unblock them to challenge them.",
            name=opponent.username,
        )
    if await has_blocked(db, opponent.id, challenger.id):
        raise AppError(
            403, "challenge_refused", "You cannot challenge {name}.", name=opponent.username
        )
    await check_abort_cooldown(db, challenger.id, now)
    if not await presence.online([opponent.id]):
        raise AppError(409, "player_offline", "{name} is not online.", name=opponent.username)
    if await games.busy(db, [challenger.id, opponent.id]):
        raise busy_error()
    if data.rated:
        last = await games.last_rated_match(db, challenger.id, opponent.id)
        if last is not None and now - last < RATED_MATCH_EVERY:
            raise _rated_limit(opponent.username, last + RATED_MATCH_EVERY - now)
    await _check_outgoing(db, challenger.id, now)

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
    opponent_id, opponent_name = opponent.id, opponent.username  # a rollback expires them
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # The pair already has an open challenge; say which way round it is.
        incoming = await db.scalar(
            select(Challenge.id).where(
                Challenge.pair_key == key, Challenge.challenger_id == opponent_id
            )
        )
        if incoming is not None:
            raise AppError(
                409,
                "challenge_incoming",
                "{name} has already challenged you. Accept their challenge instead.",
                name=opponent_name,
            ) from None
        raise AppError(
            409,
            "challenge_exists",
            "You have already challenged {name}. Wait for their answer.",
            name=opponent_name,
        ) from None
    return challenge


NOT_ALLOWED: Final = {
    "accept": "You cannot accept this challenge.",
    "decline": "You cannot decline this challenge.",
    "cancel": "You cannot cancel this challenge.",
}


async def respond(
    db: AsyncSession, now: datetime, user_id: uuid.UUID, challenge_id: uuid.UUID, response: Response
) -> tuple[Challenge, Game | None]:
    """Accept or decline (the opponent) or cancel (the challenger) a pending challenge.

    One conditional UPDATE decides, so of two racing responses exactly one wins. Accepting
    starts the game in the same transaction: there is never an accepted challenge without one.
    """
    if response == "accept":
        await check_abort_cooldown(db, user_id, now)
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
            # Answered by its named opponent, so it has one.
            players = [challenge.challenger_id, challenge.opponent_id or challenge.challenger_id]
            try:
                game = await games.start_game(db, challenge, now)
            except IntegrityError:
                await db.rollback()
                if await games.busy(db, players):
                    raise busy_error() from None
                raise
        await db.commit()
        return challenge, game
    await db.rollback()
    challenge = await db.get(Challenge, challenge_id)
    if challenge is None or user_id not in (challenge.challenger_id, challenge.opponent_id):
        raise AppError(404, "challenge_not_found", "No such challenge.")
    if (response == "cancel") != (user_id == challenge.challenger_id):
        raise AppError(403, "not_allowed", NOT_ALLOWED[response])
    raise AppError(409, "challenge_closed", "This challenge is no longer open.")


async def find_link(db: AsyncSession, code: str, now: datetime) -> Challenge:
    challenge = await db.scalar(select(Challenge).where(Challenge.code == code))
    if challenge is None:
        raise AppError(
            404, "challenge_not_found", "No such challenge. Ask your friend for a new link."
        )
    if challenge.status == ChallengeStatus.PENDING and challenge.expires_at <= now:
        challenge.status = ChallengeStatus.EXPIRED  # shown as expired; nothing is saved
    return challenge


async def accept_link(
    db: AsyncSession, presence: Presence, now: datetime, user: User, code: str
) -> tuple[Challenge, Game]:
    """Accept a challenge by link: the one who accepts first plays the challenger, who must be
    online. One conditional UPDATE decides between two people accepting at once."""
    challenge = await find_link(db, code, now)
    if challenge.challenger_id == user.id:
        raise AppError(409, "own_challenge", "This is your challenge; send the link to a friend.")
    if challenge.status != ChallengeStatus.PENDING:
        raise AppError(409, "challenge_closed", "This challenge is no longer open.")
    challenger = await db.get(User, challenge.challenger_id)
    assert challenger is not None  # noqa: S101 - challenges go with their challenger
    if await has_blocked(db, challenger.id, user.id) or await has_blocked(
        db, user.id, challenger.id
    ):
        raise AppError(403, "challenge_refused", "You cannot accept this challenge.")
    if not await presence.online([challenger.id]):
        raise AppError(
            409,
            "player_offline",
            "{name} is not online. Try again when they are.",
            name=challenger.username,
        )
    await check_abort_cooldown(db, user.id, now)
    claimed = await db.execute(
        update(Challenge)
        .where(
            Challenge.id == challenge.id,
            Challenge.opponent_id.is_(None),
            Challenge.status == ChallengeStatus.PENDING,
            Challenge.expires_at > now,
        )
        .values(opponent_id=user.id, status=ChallengeStatus.ACCEPTED, responded_at=now)
    )
    if claimed.rowcount != 1:  # type: ignore[attr-defined]
        await db.rollback()
        raise AppError(409, "challenge_closed", "Someone else accepted first.")
    await db.refresh(challenge)
    try:
        game = await games.start_game(db, challenge, now)
    except IntegrityError:
        await db.rollback()
        raise busy_error() from None
    await db.commit()
    return challenge, game


async def check_abort_cooldown(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> None:
    wait = await games.abort_cooldown(db, user_id, now)
    if wait > timedelta(0):
        minutes = math.ceil(wait.total_seconds() / 60)
        raise AppError(
            429,
            "abort_cooldown",
            (
                "You have aborted {limit} games in the last 24 hours (not making a first move "
                "counts too). You can start new games again in 1 minute."
                if minutes == 1
                else "You have aborted {limit} games in the last 24 hours (not making a first "
                "move counts too). You can start new games again in {minutes} minutes."
            ),
            headers={"Retry-After": str(math.ceil(wait.total_seconds()))},
            limit=games.ABORT_LIMIT,
            minutes=minutes,
        )


def _rated_limit(opponent: str, wait: timedelta) -> AppError:
    hours = math.ceil(wait.total_seconds() / 3600)
    return AppError(
        429,
        "rated_match_limit",
        (
            "You have already played a rated match against {opponent} in the last 24 hours. "
            "You can play another in under an hour; casual games are always open."
            if hours <= 1
            else "You have already played a rated match against {opponent} in the last 24 "
            "hours. You can play another in {hours} hours; casual games are always open."
        ),
        headers={"Retry-After": str(math.ceil(wait.total_seconds()))},
        opponent=opponent,
        hours=hours,
    )


def busy_error() -> AppError:
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
    ids = {c.challenger_id for c in challenges} | {
        c.opponent_id for c in challenges if c.opponent_id is not None
    }
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
            opponent=None
            if c.opponent_id is None
            else PlayerOut(id=c.opponent_id, username=names[c.opponent_id]),
            code=c.code,
            time_control=label_of(c.initial_seconds, c.increment_seconds),
            rated=c.rated,
            side=c.challenger_side,
            status=ChallengeStatus(c.status),
            created_at=c.created_at,
            expires_at=c.expires_at,
            game_id=game_ids.get(c.id),
        )
        for c in challenges
    ]
