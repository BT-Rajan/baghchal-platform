import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from baghchal_server.db import MYSQL_TABLE_ARGS, Base, UTCDateTime


class Room(Base):
    """A private room: an invitation link to one game, for whoever the host shares it with."""

    __tablename__ = "rooms"
    __table_args__ = (
        Index("ix_rooms_host_id_status", "host_id", "status"),
        MYSQL_TABLE_ARGS,
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(16), unique=True)
    host_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    time_control: Mapped[str] = mapped_column(String(8))
    host_side: Mapped[str] = mapped_column(String(8))
    """goat, tiger or random."""
    status: Mapped[str] = mapped_column(String(8))
    game_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("games.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
