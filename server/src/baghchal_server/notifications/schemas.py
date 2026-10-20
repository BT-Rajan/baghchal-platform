import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel

from baghchal_server.lobby.schemas import PlayerOut


class NotificationKind(StrEnum):
    CHALLENGE = "challenge"
    """``actor`` challenged me; ``detail`` is the terms ("5+3 casual")."""
    FRIEND_REQUEST = "friend_request"
    FRIEND_ACCEPTED = "friend_accepted"
    TOURNAMENT_STARTED = "tournament_started"
    """A tournament I play in has started; see ``tournament``."""
    TOURNAMENT_ROUND = "tournament_round"
    """A new round of ``tournament``: my game is against ``actor`` (none: I have the bye)."""
    TOURNAMENT_FINISHED = "tournament_finished"
    """``tournament`` has ended: the final standings are in."""


class TournamentRef(BaseModel):
    code: str
    name: str


class NotificationOut(BaseModel):
    id: uuid.UUID
    kind: NotificationKind
    actor: PlayerOut | None
    """None if they have since deleted their account."""
    detail: str | None
    tournament: TournamentRef | None
    created_at: datetime
    read: bool


class NotificationList(BaseModel):
    unread: int
    items: list[NotificationOut]
    """Newest first."""
