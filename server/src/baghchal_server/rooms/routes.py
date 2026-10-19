from typing import Annotated, Final

from fastapi import APIRouter, Path, status

from baghchal_server.deps import DB, CurrentUser, State, enforce_limit
from baghchal_server.games.events import notify as notify_game
from baghchal_server.ratelimit import Limit
from baghchal_server.rooms import service
from baghchal_server.rooms.schemas import RoomIn, RoomOut

router = APIRouter(prefix="/api/v1")

ROOMS_PER_USER: Final = Limit("room-create", 30, 3600)
JOINS_PER_USER: Final = Limit("room-join", 60, 3600)

Code = Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,16}$")]


@router.post("/rooms", status_code=status.HTTP_201_CREATED)
async def create_room(data: RoomIn, user: CurrentUser, state: State, db: DB) -> RoomOut:
    """Make a private room (Pro): a link to one casual game, for whoever opens it first."""
    await enforce_limit(state, ROOMS_PER_USER, str(user.id))
    room = await service.create(db, state.clock(), user, data)
    (out,) = await service.describe(db, [room])
    return out


@router.get("/rooms")
async def my_rooms(user: CurrentUser, state: State, db: DB) -> list[RoomOut]:
    """My open rooms."""
    return await service.describe(db, await service.mine(db, user.id, state.clock()))


@router.get("/rooms/{code}")
async def room(code: Code, user: CurrentUser, state: State, db: DB) -> RoomOut:
    """A room, for someone who has its link."""
    (out,) = await service.describe(db, [await service.find(db, code, state.clock())])
    return out


@router.post("/rooms/{code}/join")
async def join_room(code: Code, user: CurrentUser, state: State, db: DB) -> RoomOut:
    """Play the host: the game starts now (its id is in ``game_id``; both get a ``game``
    event). The host must be online."""
    await enforce_limit(state, JOINS_PER_USER, str(user.id))
    joined, game = await service.join(db, state.presence, state.clock(), user, code)
    await notify_game(state, db, game)
    (out,) = await service.describe(db, [joined])
    return out


@router.post("/rooms/{code}/close")
async def close_room(code: Code, user: CurrentUser, state: State, db: DB) -> RoomOut:
    (out,) = await service.describe(db, [await service.close(db, state.clock(), user.id, code)])
    return out
