import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict

from baghchal_server.lobby.schemas import PlayerOut, Side, TimeControlLabel


class RoomStatus(StrEnum):
    OPEN = "open"
    """Waiting for someone to join."""
    PLAYED = "played"
    """Someone joined; the game started."""
    CLOSED = "closed"
    """Closed by the host, or expired."""


class RoomIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    time_control: TimeControlLabel
    side: Side = "random"
    """The host's side."""


class RoomOut(BaseModel):
    code: str
    """Share ``/room/<code>``: whoever opens it first plays the host."""
    host: PlayerOut
    time_control: TimeControlLabel
    host_side: Side
    status: RoomStatus
    game_id: uuid.UUID | None
    expires_at: datetime
