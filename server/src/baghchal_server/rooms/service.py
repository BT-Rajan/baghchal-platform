"""Private rooms (a Pro feature): the host makes an invitation link to a casual game; whoever
opens it first, signed in, plays them. Rooms last a day, or until played or closed."""

import secrets
import uuid
from datetime import datetime, timedelta
from typing import Final

from sqlalchemy import ColumnElement, and_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import User
from baghchal_server.billing import service as billing
from baghchal_server.billing.plans import Feature
from baghchal_server.errors import AppError
from baghchal_server.games import service as games
from baghchal_server.games.models import Game
from baghchal_server.lobby import service as lobby
from baghchal_server.lobby.schemas import PlayerOut
from baghchal_server.lobby.time_controls import TIME_CONTROLS
from baghchal_server.realtime.presence import Presence
from baghchal_server.rooms.models import Room
from baghchal_server.rooms.schemas import RoomIn, RoomOut, RoomStatus

LIFETIME: Final = timedelta(days=1)
OPEN_PER_HOST: Final = 5
WHAT: Final = "A private room"


def _open(now: datetime) -> ColumnElement[bool]:
    return and_(Room.status == RoomStatus.OPEN, Room.expires_at > now)


async def create(db: AsyncSession, now: datetime, host: User, data: RoomIn) -> Room:
    await billing.require(db, host.id, now, Feature.PRIVATE_ROOMS, WHAT)
    rooms = await db.scalars(select(Room.id).where(Room.host_id == host.id, _open(now)))
    if len(rooms.all()) >= OPEN_PER_HOST:
        raise AppError(
            409, "too_many_rooms", f"You have {OPEN_PER_HOST} open rooms; close one first."
        )
    room = Room(
        id=uuid.uuid4(),
        code=secrets.token_urlsafe(6),
        host_id=host.id,
        time_control=data.time_control,
        host_side=data.side,
        status=RoomStatus.OPEN,
        created_at=now,
        expires_at=now + LIFETIME,
    )
    db.add(room)
    await db.commit()
    return room


async def find(db: AsyncSession, code: str, now: datetime) -> Room:
    room = await db.scalar(select(Room).where(Room.code == code))
    if room is None:
        raise AppError(404, "room_not_found", "No such room. Ask your friend for a new link.")
    if room.status == RoomStatus.OPEN and room.expires_at <= now:
        room.status = RoomStatus.CLOSED  # shown as closed; stored when something else commits
    return room


async def mine(db: AsyncSession, host_id: uuid.UUID, now: datetime) -> list[Room]:
    found = await db.scalars(
        select(Room).where(Room.host_id == host_id, _open(now)).order_by(Room.created_at)
    )
    return list(found)


async def join(
    db: AsyncSession, presence: Presence, now: datetime, guest: User, code: str
) -> tuple[Room, Game]:
    """Play the host. One conditional UPDATE decides, so of two guests exactly one gets in."""
    room = await find(db, code, now)
    if room.host_id == guest.id:
        raise AppError(409, "own_room", "This is your room; share the link with a friend.")
    if room.status != RoomStatus.OPEN:
        raise AppError(409, "room_closed", "This room is closed. Ask your friend for a new link.")
    host = await db.get(User, room.host_id)
    assert host is not None  # noqa: S101 - rooms go with their host
    if await lobby.has_blocked(db, room.host_id, guest.id) or await lobby.has_blocked(
        db, guest.id, room.host_id
    ):
        raise AppError(403, "player_blocked", "You cannot play in this room.")
    if not await presence.online([room.host_id]):
        raise AppError(
            409, "host_offline", f"{host.username} is not online. Try again when they are."
        )
    await lobby.check_abort_cooldown(db, guest.id, now)
    claimed = await db.execute(
        update(Room).where(Room.id == room.id, _open(now)).values(status=RoomStatus.PLAYED)
    )
    if claimed.rowcount != 1:  # type: ignore[attr-defined]
        await db.rollback()
        raise AppError(409, "room_closed", "Someone else joined first.")
    side = room.host_side if room.host_side != "random" else secrets.choice(("goat", "tiger"))
    goat_id, tiger_id = (host.id, guest.id) if side == "goat" else (guest.id, host.id)
    tc = TIME_CONTROLS[room.time_control]
    try:
        game = await games.start_casual_game(
            db,
            now,
            goat_id=goat_id,
            tiger_id=tiger_id,
            initial_seconds=tc.initial_seconds,
            increment_seconds=tc.increment_seconds,
        )
    except IntegrityError:
        await db.rollback()
        raise lobby.busy_error() from None
    room.game_id = game.id
    await db.commit()
    await db.refresh(room)
    return room, game


async def close(db: AsyncSession, now: datetime, host_id: uuid.UUID, code: str) -> Room:
    room = await find(db, code, now)
    if room.host_id != host_id:
        raise AppError(403, "not_your_room", "Only the host can close a room.")
    if room.status == RoomStatus.OPEN:
        room.status = RoomStatus.CLOSED
    await db.commit()
    return room


async def describe(db: AsyncSession, rooms: list[Room]) -> list[RoomOut]:
    hosts = {r.host_id for r in rooms}
    names = dict((await db.execute(select(User.id, User.username).where(User.id.in_(hosts)))).all())
    return [
        RoomOut(
            code=r.code,
            host=PlayerOut(id=r.host_id, username=names[r.host_id]),
            time_control=r.time_control,
            host_side=r.host_side,
            status=RoomStatus(r.status),
            game_id=r.game_id,
            expires_at=r.expires_at,
        )
        for r in rooms
    ]
