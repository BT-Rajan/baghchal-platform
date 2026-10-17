import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

Username = Annotated[
    str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{2,19}$", strict=True)
]
Password = Annotated[str, StringConstraints(min_length=10, max_length=128, strict=True)]
Token = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{43}$", strict=True)]
CurrentPassword = Annotated[str, StringConstraints(min_length=1, max_length=128, strict=True)]
Email = Annotated[EmailStr, Field(max_length=254)]
Transport = Literal["cookie", "bearer"]
"""Browsers use a cookie; native apps ask for a bearer token in the response body."""


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RegisterIn(Strict):
    username: Username
    email: Email
    password: Password


class VerifyEmailIn(Strict):
    token: Token
    transport: Transport = "cookie"


class LoginIn(Strict):
    login: Annotated[str, StringConstraints(min_length=1, max_length=254, strict=True)]
    """Username or email address."""
    password: Annotated[str, StringConstraints(min_length=1, max_length=128, strict=True)]
    transport: Transport = "cookie"


class PasswordResetRequestIn(Strict):
    email: Email


class PasswordResetConfirmIn(Strict):
    token: Token
    password: Password


class PasswordChangeIn(Strict):
    current_password: CurrentPassword
    new_password: Password


class EmailChangeIn(Strict):
    password: CurrentPassword
    email: Email


class EmailChangeConfirmIn(Strict):
    token: Token


class EmailChangedOut(BaseModel):
    email: str


class DeleteAccountIn(Strict):
    password: CurrentPassword


class UserOut(BaseModel):
    id: uuid.UUID
    username: str
    created_at: datetime


class MeOut(UserOut):
    email: str


class SessionOut(BaseModel):
    user: MeOut
    token: str | None = None
    """Only present for ``transport="bearer"``."""


class Accepted(BaseModel):
    status: Literal["accepted"] = "accepted"


# ── Data export ───────────────────────────────────────────────────────────


class ExportAccount(BaseModel):
    id: uuid.UUID
    username: str
    email: str
    created_at: datetime
    email_verified_at: datetime | None


class ExportRating(BaseModel):
    category: str
    rating: float
    deviation: float
    volatility: float
    games: int
    updated_at: datetime


class ExportGame(BaseModel):
    id: uuid.UUID
    created_at: datetime
    finished_at: datetime | None
    time_control: str
    rated: bool
    side: Literal["goat", "tiger"]
    opponent: str
    status: str
    winner: str | None
    end_reason: str | None
    rating_change: int | None
    moves: list[str]


class ExportChallenge(BaseModel):
    id: uuid.UUID
    created_at: datetime
    direction: Literal["sent", "received"]
    opponent: str
    time_control: str
    rated: bool
    status: str


class ExportSession(BaseModel):
    created_at: datetime
    last_used_at: datetime
    expires_at: datetime


class ExportOut(BaseModel):
    """Everything the server keeps about a player, for them to download."""

    exported_at: datetime
    account: ExportAccount
    ratings: list[ExportRating]
    games: list[ExportGame]
    challenges: list[ExportChallenge]
    blocked_players: list[str]
    sessions: list[ExportSession]
