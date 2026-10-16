from pydantic import BaseModel

from baghchal_server.lobby.schemas import PlayerOut


class LeaderboardEntry(BaseModel):
    rank: int
    player: PlayerOut
    rating: int
    games: int
