import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from baghchal_server.db import MYSQL_TABLE_ARGS, Base, UTCDateTime


class ChallengeStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class Challenge(Base):
    """An invitation from one player to another to play a game.

    ``pair_key`` is set only while the challenge is pending and is unique, so two players can
    have at most one open challenge between them, whoever sent it, even under concurrent
    requests. It is cleared when the challenge is resolved or found expired.
    """

    __tablename__ = "challenges"
    __table_args__ = (
        Index("ix_challenges_opponent_id_status", "opponent_id", "status"),
        Index("ix_challenges_challenger_id_status", "challenger_id", "status"),
        MYSQL_TABLE_ARGS,
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    challenger_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE")
    )
    opponent_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    pair_key: Mapped[str | None] = mapped_column(String(73), unique=True)
    initial_seconds: Mapped[int] = mapped_column(Integer)
    increment_seconds: Mapped[int] = mapped_column(Integer)
    rated: Mapped[bool] = mapped_column(Boolean)
    challenger_side: Mapped[str | None] = mapped_column(String(8))
    """``goat``, ``tiger`` or ``random`` for casual games; None for rated (sides alternate)."""
    status: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    responded_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
