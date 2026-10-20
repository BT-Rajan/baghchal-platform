import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from baghchal_server.db import MYSQL_TABLE_ARGS, Base, UTCDateTime


class Payment(Base):
    """One purchase of a plan for a month or a year, from the order to the money arriving.

    Kept when an account is deleted (``user_id`` becomes null): payments are accounting records.
    """

    __tablename__ = "payments"
    __table_args__ = (
        Index("ix_payments_user_id_created_at", "user_id", "created_at"),
        MYSQL_TABLE_ARGS,
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    plan: Mapped[str] = mapped_column(String(16))
    period: Mapped[str] = mapped_column(String(8))
    amount_paise: Mapped[int] = mapped_column(Integer)
    order_id: Mapped[str] = mapped_column(String(64), unique=True)
    payment_id: Mapped[str | None] = mapped_column(String(64), index=True)
    """Razorpay's ``pay_…`` id, once paid."""
    status: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    paid_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    grant_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("grants.id", ondelete="SET NULL")
    )
    """The time it bought."""


class PaymentKeys(Base):
    """The Razorpay keys an admin entered: one row (``id`` 1), the secrets encrypted with
    ``secrets_key`` (Fernet), so a copy of the database alone does not give them away."""

    __tablename__ = "payment_keys"
    __table_args__ = MYSQL_TABLE_ARGS

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key_id: Mapped[str] = mapped_column(String(64))
    key_secret: Mapped[str] = mapped_column(String(512))
    webhook_secret: Mapped[str] = mapped_column(String(512))
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )


class Refund(Base):
    """Money Razorpay gave back on a payment (one row per refund, so a repeated webhook counts
    once). Once a payment is refunded in full, the plan time it bought ends."""

    __tablename__ = "payment_refunds"
    __table_args__ = MYSQL_TABLE_ARGS

    refund_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    payment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("payments.id", ondelete="CASCADE"), index=True
    )
    amount_paise: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
