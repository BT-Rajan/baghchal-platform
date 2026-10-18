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
    payment_id: Mapped[str | None] = mapped_column(String(64))
    """Razorpay's ``pay_…`` id, once paid."""
    status: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    paid_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    grant_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("grants.id", ondelete="SET NULL")
    )
    """The time it bought."""
