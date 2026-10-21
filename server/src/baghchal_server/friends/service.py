"""Friend requests and friends. Asking someone who has already asked you makes you friends at
once; removing works the same whichever side you are on (decline, cancel, or unfriend). A block
between two players ends their friendship and stops new requests."""

import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Final

from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import User
from baghchal_server.accounts.service import GUEST
from baghchal_server.errors import AppError
from baghchal_server.friends.models import Friendship
from baghchal_server.friends.schemas import Relation
from baghchal_server.lobby import service as lobby

MAX_FRIENDS: Final = 200
MAX_REQUESTS: Final = 50
"""Requests of mine waiting for an answer."""


async def _row(db: AsyncSession, a: uuid.UUID, b: uuid.UUID) -> Friendship | None:
    return await db.scalar(select(Friendship).where(Friendship.pair_key == lobby.pair_key(a, b)))


def _relation(row: Friendship | None, viewer_id: uuid.UUID) -> Relation:
    if row is None:
        return "none"
    if row.accepted_at is not None:
        return "friends"
    return "requested" if row.requester_id == viewer_id else "incoming"


async def relation(db: AsyncSession, viewer_id: uuid.UUID, other_id: uuid.UUID) -> Relation:
    return _relation(await _row(db, viewer_id, other_id), viewer_id)


async def _count_friends(db: AsyncSession, user_id: uuid.UUID) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(Friendship)
            .where(
                or_(Friendship.requester_id == user_id, Friendship.addressee_id == user_id),
                Friendship.accepted_at.is_not(None),
            )
        )
        or 0
    )


async def _check_room(db: AsyncSession, user: User, other: User) -> None:
    for who in (user, other):
        if await _count_friends(db, who.id) >= MAX_FRIENDS:
            raise AppError(
                409,
                "friend_limit",
                "You have {limit} friends already."
                if who.id == user.id
                else "{name} has {limit} friends already.",
                limit=MAX_FRIENDS,
                name=who.username,
            )


async def request(db: AsyncSession, now: datetime, user: User, other: User) -> Relation:
    """Ask ``other`` to be friends, or accept if they asked first. Asking again changes
    nothing."""
    user_id, other_id = user.id, other.id  # still readable after a rollback
    if other_id == user_id:
        raise AppError(422, "cannot_friend_self", "You cannot add yourself.")
    if other.role == GUEST:
        raise AppError(
            409, "guest_has_no_friends", "{name} is playing as a guest.", name=other.username
        )
    if await lobby.has_blocked(db, user.id, other.id) or await lobby.has_blocked(
        db, other.id, user.id
    ):
        raise AppError(403, "friend_refused", "You cannot add {name}.", name=other.username)
    row = await _row(db, user.id, other.id)
    if row is not None and row.accepted_at is None and row.addressee_id == user.id:
        await _check_room(db, user, other)
        row.accepted_at = now
        await db.commit()
        return "friends"
    if row is not None:
        return _relation(row, user.id)
    waiting = await db.scalar(
        select(func.count())
        .select_from(Friendship)
        .where(Friendship.requester_id == user.id, Friendship.accepted_at.is_(None))
    )
    if (waiting or 0) >= MAX_REQUESTS:
        raise AppError(
            429,
            "too_many_friend_requests",
            "You have {limit} friend requests waiting. Cancel some first.",
            limit=MAX_REQUESTS,
        )
    await _check_room(db, user, other)
    db.add(
        Friendship(
            requester_id=user.id,
            addressee_id=other.id,
            pair_key=lobby.pair_key(user.id, other.id),
            created_at=now,
        )
    )
    try:
        await db.commit()
    except IntegrityError:  # both asked at the same moment: the other request is the one kept
        await db.rollback()
        return await relation(db, user_id, other_id)
    return "requested"


async def remove(db: AsyncSession, user_id: uuid.UUID, other_id: uuid.UUID) -> bool:
    """End a friendship, or decline or cancel a request. Returns whether there was one."""
    result = await db.execute(
        delete(Friendship).where(Friendship.pair_key == lobby.pair_key(user_id, other_id))
    )
    await db.commit()
    return bool(result.rowcount)  # type: ignore[attr-defined]


async def lists(
    db: AsyncSession, user_id: uuid.UUID, now: datetime
) -> tuple[Sequence[User], Sequence[User], Sequence[User]]:
    """My friends, the requests to me, and mine, each by name; players who can no longer
    play (banned, deleted) are left out."""
    rows = (
        await db.scalars(
            select(Friendship).where(
                or_(Friendship.requester_id == user_id, Friendship.addressee_id == user_id)
            )
        )
    ).all()
    other = {r.addressee_id if r.requester_id == user_id else r.requester_id: r for r in rows}
    users = await lobby.users_by_id(db, list(other), now)

    def pick(kind: Relation) -> list[User]:
        found = [u for uid, u in users.items() if _relation(other[uid], user_id) == kind]
        return sorted(found, key=lambda u: u.username_key)

    return pick("friends"), pick("incoming"), pick("requested")


async def friend_names(db: AsyncSession, user_id: uuid.UUID) -> list[str]:
    """My friends' usernames, for my data export."""
    rows = await db.scalars(
        select(User.username)
        .join(
            Friendship,
            or_(
                (Friendship.requester_id == user_id) & (Friendship.addressee_id == User.id),
                (Friendship.addressee_id == user_id) & (Friendship.requester_id == User.id),
            ),
        )
        .where(Friendship.accepted_at.is_not(None))
        .order_by(User.username_key)
    )
    return list(rows.all())
