from fastapi import APIRouter

from baghchal_server.achievements import service
from baghchal_server.achievements.schemas import AchievementOut
from baghchal_server.deps import DB, CurrentUser, State
from baghchal_server.errors import AppError
from baghchal_server.lobby import service as lobby
from baghchal_server.lobby.schemas import UsernameQuery

router = APIRouter(prefix="/api/v1")


@router.get("/players/{username}/achievements")
async def achievements(
    username: UsernameQuery, user: CurrentUser, state: State, db: DB
) -> list[AchievementOut]:
    """A player's achievements: every one, with when they earned it (None if not yet)."""
    player = await lobby.find_player(db, username, state.clock())
    if player is None:
        raise AppError(404, "player_not_found", "No such player.")
    return await service.of(db, player.id)
