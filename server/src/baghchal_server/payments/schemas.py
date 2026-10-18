import uuid
from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Period(StrEnum):
    MONTH = "month"
    YEAR = "year"


class PaymentStatus(StrEnum):
    CREATED = "created"
    """Waiting for the player to pay."""
    PAID = "paid"
    FAILED = "failed"
    """The last attempt failed; the player may still pay the same order."""


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
    until: datetime | None
    """When the plan it bought ends (later purchases add on), once paid."""


class PaymentsOut(BaseModel):
    enabled: bool
    """Whether payments are taken (the server has Razorpay keys)."""
    payments: list[PaymentOut]
