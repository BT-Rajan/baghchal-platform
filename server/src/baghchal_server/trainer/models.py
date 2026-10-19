import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from baghchal_server.db import MYSQL_TABLE_ARGS, Base, UTCDateTime


class Attempt(Base):
    """A player's answer to a trainer puzzle."""

    __tablename__ = "trainer_attempts"
    __table_args__ = (
        Index("ix_trainer_attempts_user_id_created_at", "user_id", "created_at"),
        MYSQL_TABLE_ARGS,
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    puzzle_id: Mapped[str] = mapped_column(String(8))
    move: Mapped[str] = mapped_column(String(16))
    correct: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
