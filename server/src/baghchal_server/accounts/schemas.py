import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

from baghchal_server.legal.age import BirthMonth

Username = Annotated[
    str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{2,19}$", strict=True)
]
Password = Annotated[str, StringConstraints(min_length=10, max_length=128, strict=True)]
Token = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{43}$", strict=True)]
CurrentPassword = Annotated[str, StringConstraints(min_length=1, max_length=128, strict=True)]
Email = Annotated[EmailStr, Field(max_length=254)]
LegalVersion = Annotated[str, StringConstraints(min_length=1, max_length=16, strict=True)]
Transport = Literal["cookie", "bearer"]
"""Browsers use a cookie; native apps ask for a bearer token in the response body."""


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Agreement(Strict):
    """What sign-up asks besides the account: the player's month of birth (see legal/age.py)
    and the versions of the terms and privacy policy they accepted (GET /legal)."""

    birth_month: BirthMonth
    """``YYYY-MM``."""
    terms_version: LegalVersion
    privacy_version: LegalVersion


class RegisterIn(Agreement):
    username: Username
    email: Email
    password: Password
    parent_email: Email | None = None
    """Required for players under 18: their parent or guardian is asked to agree."""


class ClaimIn(Strict):
    """A guest's account: as for sign-up, but the month of birth the guest gave is kept, so
    it is asked again only of guests who never gave one."""

    username: Username
    email: Email
    password: Password
    terms_version: LegalVersion
    privacy_version: LegalVersion
    birth_month: BirthMonth | None = None
    parent_email: Email | None = None
    """Required for players under 18: their parent or guardian is asked to agree."""


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


class ResendVerificationIn(Strict):
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
    """A guest's is a placeholder until they claim the account."""
    role: Literal["guest", "player", "moderator", "admin"]
    plays_people: bool
    """False while a parent's agreement is awaited (players under 18): the computer only."""
    parent_consent: Literal["pending", "given"] | None
    """For players under 18."""
    age_needed: bool
    """The account predates the age question: ask it (POST /me/consents)."""
    consents_needed: list[Literal["terms", "privacy"]]
    """Documents changed since the player last accepted them: ask again (POST /me/consents)."""


class GuestIn(Agreement):
    transport: Transport = "cookie"


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
    adult_from: datetime | None
    """When you are surely 18, if you were not when you signed up (we keep only this)."""
    parent_email: str | None
    parent_consented_at: datetime | None


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
    opponent: str | None
    """None for a challenge by link that nobody accepted."""
    time_control: str
    rated: bool
    status: str


class ExportSession(BaseModel):
    created_at: datetime
    last_used_at: datetime
    expires_at: datetime


class ExportNotification(BaseModel):
    kind: str
    created_at: datetime
    read_at: datetime | None


class ExportConsent(BaseModel):
    document: str
    version: str
    accepted_at: datetime


class ExportOut(BaseModel):
    """Everything the server keeps about a player, for them to download."""

    exported_at: datetime
    account: ExportAccount
    consents: list[ExportConsent]
    ratings: list[ExportRating]
    games: list[ExportGame]
    challenges: list[ExportChallenge]
    blocked_players: list[str]
    friends: list[str]
    notifications: list["ExportNotification"]
    sessions: list[ExportSession]
