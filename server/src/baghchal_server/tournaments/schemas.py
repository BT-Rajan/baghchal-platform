import uuid
from datetime import datetime
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from baghchal_server.lobby.schemas import PlayerOut, TimeControlLabel

MIN_PLAYERS = 3
MAX_PLAYERS = 6


class TournamentStatus(StrEnum):
    OPEN = "open"
    """Players are joining."""
    RUNNING = "running"
    FINISHED = "finished"


class PairingState(StrEnum):
    WAITING = "waiting"
    """Not played yet: either player can start it while the other is online."""
    PLAYING = "playing"
    DONE = "done"


class TournamentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    time_control: TimeControlLabel
    max_players: int = Field(default=MAX_PLAYERS, ge=MIN_PLAYERS, le=MAX_PLAYERS)


class PairingOut(BaseModel):
    id: uuid.UUID
    goat: PlayerOut
    tiger: PlayerOut
    state: PairingState
    game_id: uuid.UUID | None
    winner: PlayerOut | None


class StandingOut(BaseModel):
    player: PlayerOut
    points: int
    """One for each game won."""
    played: int


class TournamentOut(BaseModel):
    code: str
    """Share ``/tournament/<code>`` to invite players."""
    name: str
    host: PlayerOut
    time_control: TimeControlLabel
    max_players: int
    status: TournamentStatus
    players: list[PlayerOut]
    standings: list[StandingOut]
    """Most points first, once started."""
    pairings: list[PairingOut]
    created_at: datetime
