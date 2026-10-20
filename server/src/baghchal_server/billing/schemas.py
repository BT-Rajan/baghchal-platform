import uuid
from datetime import datetime
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from baghchal_server.billing.plans import Feature, Plan
from baghchal_server.moderation.schemas import Reason


class PlanInfo(BaseModel):
    plan: Plan
    name: str
    features: list[Feature]
    monthly_paise: int | None
    """None for Free."""
    yearly_paise: int | None
    """None for Free, and for a plan not sold for a year."""
    games: int | None
    """Finished games one purchase lasts, if it ends on that as well as its month."""
    analyses_per_day: int | None
    """None: no limit."""


class GrantOut(BaseModel):
    id: uuid.UUID
    plan: Plan | None
    feature: Feature | None
    starts_at: datetime
    ends_at: datetime | None
    games_left: int | None
    """Finished games it still lasts, if it ends on that too."""
    reason: str
    granted_by: str | None
    """The admin's username, while their account exists."""
    created_at: datetime
    revoked_at: datetime | None
    active: bool
    paid: bool
    """Bought by the player (see ``payments``), rather than given by an admin."""


class MyPlanOut(BaseModel):
    plan: Plan
    plan_until: datetime | None
    """When the current plan ends at the latest (None: it does not, or it is Free)."""
    games_left: int | None
    """Finished games the current plan still lasts, if it ends on that too (bought Plus)."""
    features: list[Feature]
    grants: list[GrantOut]
    """Grants in force now."""
    waiting: list[GrantOut]
    """Plan time lined up to start later: a cheaper plan's waits until a dearer one ends."""


class PlayerPlanOut(MyPlanOut):
    """An admin's view of a player: every grant, past ones included."""

    username: str
    history: list[GrantOut]


class GrantIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: Plan | None = None
    feature: Feature | None = None
    days: Annotated[int, Field(ge=1, le=3650)] | None
    """How long; ``null`` grants it until revoked."""
    reason: Reason

    @model_validator(mode="after")
    def _one_thing(self) -> Self:
        if (self.plan is None) == (self.feature is None):
            raise ValueError("grant either a plan or a feature")
        if self.plan == Plan.FREE:
            raise ValueError("everyone has the Free plan")
        return self


class RevokeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: Reason
