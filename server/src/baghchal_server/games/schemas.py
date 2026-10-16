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
    deadline_at: datetime | None
    server_time: datetime
    created_at: datetime
    finished_at: datetime | None


class MoveIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ply: Annotated[int, Field(ge=0, le=10_000)]
    """The number of moves the client has seen; the move is rejected if the game moved on."""
    move: Annotated[str, StringConstraints(min_length=2, max_length=5, strict=True)]
