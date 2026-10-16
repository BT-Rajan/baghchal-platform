from typing import Annotated

from fastapi import APIRouter, Query

from baghchal_server.deps import DB, CurrentUser, State
from baghchal_server.lobby.schemas import PlayerOut
from baghchal_server.lobby.time_controls import Category
from baghchal_server.ratings import service
from baghchal_server.ratings.schemas import LeaderboardEntry

router = APIRouter(prefix="/api/v1")


@router.get("/leaderboards/{category}")
async def leaderboard(
    category: Category,
    user: CurrentUser,
    state: State,
    db: DB,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[LeaderboardEntry]:
    """Top established players (not provisional, played in the last 30 days)."""
    rows = await service.leaderboard(db, category, state.clock(), limit)
    return [
        LeaderboardEntry(
            rank=i,
            player=PlayerOut(id=row.user_id, username=name),
            rating=round(row.rating),
            games=row.games,
        )
        for i, (name, row) in enumerate(rows, start=1)
    ]
