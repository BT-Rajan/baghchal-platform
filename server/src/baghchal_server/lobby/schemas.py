import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

from baghchal_server.lobby.models import ChallengeStatus

TimeControlLabel = Literal["3+2", "5+3", "10+5", "15+10"]
Side = Literal["goat", "tiger", "random"]
UsernameQuery = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,20}$", strict=True)]


class PlayerOut(BaseModel):
    id: uuid.UUID
    username: str


class PlayerStatusOut(PlayerOut):
    online: bool


class ProfileOut(PlayerStatusOut):
    created_at: datetime


class ChallengeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    opponent: UsernameQuery
    time_control: TimeControlLabel
    rated: bool = False
    side: Side | None = None
    """Casual games only (default random). Rated games are two-game matches with sides swapped."""

    @model_validator(mode="after")
    def _side_rules(self) -> "ChallengeIn":
        if self.rated and self.side is not None:
            raise ValueError("rated games alternate sides; leave side out")
        if not self.rated and self.side is None:
            self.side = "random"
        return self


class ChallengeOut(BaseModel):
    id: uuid.UUID
    challenger: PlayerOut
    opponent: PlayerOut
    time_control: str
    rated: bool
    side: Side | None
    status: ChallengeStatus
    created_at: datetime
    expires_at: datetime


class ChallengeList(BaseModel):
    incoming: list[ChallengeOut]
    outgoing: list[ChallengeOut]
