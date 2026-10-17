import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from baghchal_server.games.models import EndReason, GameStatus
from baghchal_server.lobby.schemas import PlayerOut

SideName = Literal["goat", "tiger"]


class ResultOut(BaseModel):
    winner: SideName | None
    """None when the game was aborted."""
    reason: EndReason


class ClocksOut(BaseModel):
    goat_ms: int
    tiger_ms: int
    running: SideName | None
    """The side whose clock is counting down at ``server_time``."""


class SideRatingOut(BaseModel):
    rating: int
    """The player's rating in this time control when the game started."""
    change: int | None
    """How much the game moved it; None until a rated game ends with a result."""


class RatingsOut(BaseModel):
    goat: SideRatingOut
    tiger: SideRatingOut


class MatchScoreOut(BaseModel):
    player: PlayerOut
    points: int


class MatchOut(BaseModel):
    id: uuid.UUID
    game: int
    """Which game of the match this is: 1, or 2 (sides swapped)."""
    games: list[uuid.UUID]
    """The match's games so far, in order."""
    score: list[MatchScoreOut]


class GameOut(BaseModel):
    id: uuid.UUID
    goat: PlayerOut
    tiger: PlayerOut
    time_control: str
    rated: bool
    status: GameStatus
    result: ResultOut | None
    position: str
    """BFEN; see docs/rules.md."""
    ply: int
    side_to_move: SideName
    moves: list[str]
    legal_moves: list[str]
    """Empty once the game is over. Excludes moves that would repeat a position."""
    clocks: ClocksOut
    ratings: RatingsOut
    match: MatchOut | None
    """Rated games are played as two-game matches."""
    computer: Literal["easy", "medium", "hard"] | None
    """Set when one of the players is the computer: its level."""
    deadline_at: datetime | None
    server_time: datetime
    created_at: datetime
    finished_at: datetime | None


class ComputerGameIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    level: Literal["easy", "medium", "hard"] = "medium"
    side: Literal["goat", "tiger", "random"] = "random"
    """The side you play."""
    time_control: Literal["3+2", "5+3", "10+5", "15+10"] = "10+5"


class MoveIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ply: Annotated[int, Field(ge=0, le=10_000)]
    """The number of moves the client has seen; the move is rejected if the game moved on."""
    move: Annotated[str, StringConstraints(min_length=2, max_length=5, strict=True)]
