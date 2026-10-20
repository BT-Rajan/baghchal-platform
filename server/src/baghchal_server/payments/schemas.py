import uuid
from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr


class Period(StrEnum):
    MONTH = "month"
    YEAR = "year"


class PaymentStatus(StrEnum):
    CREATED = "created"
    """Waiting for the player to pay."""
    PAID = "paid"
    FAILED = "failed"
    """The last attempt failed; the player may still pay the same order."""
    REFUNDED = "refunded"
    """Paid, then refunded in full: the plan time it bought has ended."""
    REVERSED = "reversed"
    """Paid, then taken back by the player's bank after a dispute: its plan time has ended."""


PaidPlan = Literal["plus", "pro"]


class CheckoutIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: PaidPlan
    period: Period


class CheckoutOut(BaseModel):
    """What Razorpay Checkout needs to take the payment."""

    key_id: str
    order_id: str
    amount_paise: int
    currency: Literal["INR"] = "INR"
    name: str
    description: str
    email: str
    username: str


class VerifyIn(BaseModel):
    """What Razorpay Checkout hands the browser once the player has paid."""

    model_config = ConfigDict(extra="forbid")

    order_id: str = Field(max_length=64)
    payment_id: str = Field(max_length=64)
    signature: str = Field(max_length=128)


class PaymentOut(BaseModel):
    id: uuid.UUID
    plan: PaidPlan
    period: Period
    amount_paise: int
    status: PaymentStatus
    created_at: datetime
    paid_at: datetime | None
    starts: datetime | None
    """When the plan it bought starts, once paid: later than ``paid_at`` while a better plan
    runs first."""
    until: datetime | None
    """When the plan it bought ends, once paid (better plan time bought later pushes it on)."""


class PaymentsOut(BaseModel):
    enabled: bool
    """Whether payments are taken (the server has Razorpay keys)."""
    payments: list[PaymentOut]


class PaymentKeysIn(BaseModel):
    """The Razorpay keys (Dashboard → Account & Settings → API Keys, and → Webhooks)."""

    model_config = ConfigDict(extra="forbid")

    key_id: str = Field(pattern=r"^rzp_(test|live)_[A-Za-z0-9]{6,40}$")
    key_secret: SecretStr = Field(min_length=8, max_length=128)
    webhook_secret: SecretStr = Field(min_length=8, max_length=128)
    """The secret set on the webhook: without it a player whose browser never came back
    would pay and get nothing."""


class PaymentKeysOut(BaseModel):
    """What the payments page shows: never the secrets."""

    on: bool
    """Payments are taken: keys are set and can be read."""
    key_id: str | None
    updated_at: datetime | None
    updated_by: str | None
    """The admin who set them, while their account exists."""
    can_store: bool
    """The server has ``secrets_key``, so keys can be stored."""
    webhook_url: str
    """Where the Razorpay webhook must point."""


class AdminCodeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(pattern=r"^[0-9]{6}$")


class AdminCheckOut(BaseModel):
    until: datetime
    """This device may use the payments page until then."""
