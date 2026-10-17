import uuid
from typing import Final

from fastapi import APIRouter

from baghchal_server.deps import DB, AppState, CurrentUser, State, enforce_limit
from baghchal_server.games import service
from baghchal_server.games.events import notify
from baghchal_server.games.models import GameStatus
from baghchal_server.games.schemas import GameOut, MoveIn
from baghchal_server.ratelimit import Limit

router = APIRouter(prefix="/api/v1")

# Generous: a 3+2 game is fast, but no human needs more than a few moves a second.
MOVES_PER_USER: Final = Limit("game-move", 300, 60)


async def _settle(state: AppState, db: DB, game_id: uuid.UUID) -> None:
    """End the game now if its deadline has passed (the sweeper would, a moment later)."""
    game = await service.get_game(db, game_id)
    now = state.clock()
    if (
        game.status == GameStatus.ACTIVE
        and game.deadline_at is not None
        and game.deadline_at <= now
        and await service.expire(db, game, now)
    ):
        await notify(state, db, await service.get_game(db, game_id))


@router.get("/games")
async def my_active_games(user: CurrentUser, state: State, db: DB) -> list[GameOut]:
    """Your live games, to resume after a reconnect."""
    now = state.clock()
    return [await service.describe(db, g, now) for g in await service.active_games(db, user.id)]


@router.get("/games/{game_id}")
async def get_game(game_id: uuid.UUID, user: CurrentUser, state: State, db: DB) -> GameOut:
    await _settle(state, db, game_id)
    return await service.describe(db, await service.get_game(db, game_id), state.clock())


@router.post("/games/{game_id}/moves")
async def play(
    game_id: uuid.UUID, data: MoveIn, user: CurrentUser, state: State, db: DB
) -> GameOut:
    await enforce_limit(state, MOVES_PER_USER, str(user.id))
    await _settle(state, db, game_id)
    game = await service.play(db, game_id, user.id, data, state.clock(), presence=state.presence)
    return await notify(state, db, game)


@router.post("/games/{game_id}/resign")
async def resign(game_id: uuid.UUID, user: CurrentUser, state: State, db: DB) -> GameOut:
    await _settle(state, db, game_id)
    return await notify(state, db, await service.resign(db, game_id, user.id, state.clock()))


@router.post("/games/{game_id}/abort")
async def abort(game_id: uuid.UUID, user: CurrentUser, state: State, db: DB) -> GameOut:
    await _settle(state, db, game_id)
    return await notify(state, db, await service.abort(db, game_id, user.id, state.clock()))


@router.post("/games/{game_id}/claim-abandonment")
async def claim_abandonment(game_id: uuid.UUID, user: CurrentUser, state: State, db: DB) -> GameOut:
    await _settle(state, db, game_id)
    game = await service.claim_abandonment(db, state.presence, game_id, user.id, state.clock())
    return await notify(state, db, game)
