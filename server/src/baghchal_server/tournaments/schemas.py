import uuid
from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from baghchal_server.lobby.schemas import PlayerOut, TimeControlLabel

MIN_PLAYERS = 3
MAX_PLAYERS = 32


class TournamentStatus(StrEnum):
    OPEN = "open"
    """Players are joining."""
    RUNNING = "running"
    FINISHED = "finished"


class PairingState(StrEnum):
    WAITING = "waiting"
    """Not played yet: either player can ask the other ("Play now") while they are online."""
    PLAYING = "playing"
    DONE = "done"


class TournamentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    time_control: TimeControlLabel
    max_players: int = Field(default=MAX_PLAYERS, ge=MIN_PLAYERS, le=MAX_PLAYERS)


class PairingOut(BaseModel):
    id: uuid.UUID
    round: int
    goat: PlayerOut
    tiger: PlayerOut
    state: PairingState
    game_id: uuid.UUID | None
    winner: PlayerOut | None
    """None until played, and for a draw."""
    forfeit: bool
    """Won without a game (the host gave it, or the other player left or blocked)."""


class AwardIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    winner: Literal["goat", "tiger"]
    """The side of the player who turned up."""


class StandingOut(BaseModel):
    player: PlayerOut
    points: float
    """One for each game won and for a bye, a half for each draw."""
    buchholz: float
    """The tie-break: the points of everyone this player has played."""
    played: int


class ByeOut(BaseModel):
    """A player who sat a round out (odd numbers), scoring a point."""

    round: int
    player: PlayerOut


class TournamentOut(BaseModel):
    code: str
    """Share ``/tournament/<code>`` to invite players."""
    name: str
    host: PlayerOut
    time_control: str
    """A label; tournaments made before a time control was retired keep it."""
    max_players: int
    status: TournamentStatus
    round: int
    """The round being played (0 before the start)."""
    rounds: int
    """How many rounds (set at the start: enough for a clear winner)."""
    players: list[PlayerOut]
    standings: list[StandingOut]
    """Most points first, then the tie-break, once started."""
    pairings: list[PairingOut]
    """Every round's games, newest round first."""
    byes: list[ByeOut]
    created_at: datetime
