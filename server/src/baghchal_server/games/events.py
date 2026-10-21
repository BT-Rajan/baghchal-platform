"""Telling both players about a game's new state."""

from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.deps import AppState
from baghchal_server.games import service
from baghchal_server.games.models import Game, GameStatus
from baghchal_server.games.schemas import GameOut
from baghchal_server.realtime.protocol import GameEvent
from baghchal_server.tournaments import progress as tournament_progress


async def notify(state: AppState, db: AsyncSession, game: Game) -> GameOut:
    """Send the game's state to both players. When the first game of a match ends, the second
    has just been made too (its first-move grace begins after the break); announce it after,
    so a player who is not on game 1's screen is taken to it."""
    out = await service.describe(db, game, state.clock())
    message = GameEvent(game=out).model_dump_json()
    for user_id in (game.goat_id, game.tiger_id):
        await state.hub.send(user_id, message)
    await tournament_progress.after_game(state, db, game)
    if out.match is not None and out.status == GameStatus.FINISHED and len(out.match.games) == 2:
        following = await service.get_game(db, out.match.games[1])
        if following.id != game.id and following.ply == 0 and following.status == GameStatus.ACTIVE:
            await notify(state, db, following)
    return out
