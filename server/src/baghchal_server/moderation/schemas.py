import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from baghchal_server.accounts.schemas import Username
from baghchal_server.lobby.schemas import PlayerOut
from baghchal_server.moderation.models import ActionKind, ReportReason, ReportStatus

Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
"""Why a moderator acted. Shown to the player for suspensions and renames."""


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ReportIn(Strict):
    reason: ReportReason
    details: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] = ""
    game_id: uuid.UUID | None = None
    """A game between the two players that the report is about."""


class ReportTargetOut(PlayerOut):
    suspended_until: datetime | None


class ReportOut(BaseModel):
    id: uuid.UUID
    reporter: PlayerOut
    target: ReportTargetOut
    reason: ReportReason
    details: str
    game_id: uuid.UUID | None
    status: ReportStatus
    created_at: datetime
    resolved_at: datetime | None
    open_reports_against_target: int


class SuspendIn(Strict):
    days: Annotated[int, Field(ge=1, le=3650)] | None
    """How long; ``null`` bans the player for good."""
    reason: Reason


class ReasonIn(Strict):
    reason: Reason


class RenameIn(Strict):
    username: Username
    reason: Reason


class ModActionOut(BaseModel):
    action: ActionKind
    reason: str
    moderator: str | None
    created_at: datetime


class ModPlayerOut(BaseModel):
    """What a moderator sees about a player."""

    id: uuid.UUID
    username: str
    created_at: datetime
    role: str
    deleted: bool
    suspended_until: datetime | None
    """Set while suspended; far in the future (9999) for a ban."""
    banned: bool
    suspension_reason: str | None
    reports: list[ReportOut]
    """Reports about this player, newest first."""
    actions: list[ModActionOut]
    """What moderators did about this player, newest first."""
