import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, Uuid, true
from sqlalchemy.orm import Mapped, mapped_column

from baghchal_server.db import MYSQL_TABLE_ARGS, Base, UTCDateTime


class Appearance(Base):
    """A player's board, pieces and sounds (and whether sounds play at all), and whether others
    see their badge.

    Kept when a plan lapses (the defaults are used meanwhile), so the choices come back when it
    is renewed. No row: the defaults.
    """

    __tablename__ = "appearances"
    __table_args__ = MYSQL_TABLE_ARGS

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    board: Mapped[str] = mapped_column(String(16))
    pieces: Mapped[str] = mapped_column(String(16))
    sounds: Mapped[str] = mapped_column(String(16))
    sounds_on: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    show_badge: Mapped[bool] = mapped_column(Boolean)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)
