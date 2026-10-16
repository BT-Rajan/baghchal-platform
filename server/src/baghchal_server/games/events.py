"""Telling both players about a game's new state."""

from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.deps import AppState
from baghchal_server.games import service
from baghchal_server.games.models import Game
from baghchal_server.games.schemas import GameOut
from baghchal_server.realtime.protocol import GameEvent


async def notify(state: AppState, db: AsyncSession, game: Game) -> GameOut:
    out = await service.describe(db, game, state.clock())
    message = GameEvent(game=out).model_dump_json()
    for user_id in (game.goat_id, game.tiger_id):
        await state.hub.send(user_id, message)
    return out
