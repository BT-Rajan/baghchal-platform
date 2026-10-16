import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

Username = Annotated[
    str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{2,19}$", strict=True)
]
Password = Annotated[str, StringConstraints(min_length=10, max_length=128, strict=True)]
Token = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{43}$", strict=True)]
Transport = Literal["cookie", "bearer"]
"""Browsers use a cookie; native apps ask for a bearer token in the response body."""


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RegisterIn(Strict):
    username: Username
    email: Annotated[EmailStr, Field(max_length=254)]
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
    email: Annotated[EmailStr, Field(max_length=254)]


class PasswordResetConfirmIn(Strict):
    token: Token
    password: Password


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
