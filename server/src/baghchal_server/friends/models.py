import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from baghchal_server.db import MYSQL_TABLE_ARGS, Base, UTCDateTime


class Friendship(Base):
    """``requester`` asked ``addressee`` to be friends; they are friends once it is accepted.
    A pair of players has at most one row, whichever of them asked (``pair_key``)."""

    __tablename__ = "friendships"
    __table_args__ = (Index("ix_friendships_addressee_id", "addressee_id"), MYSQL_TABLE_ARGS)

    requester_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    addressee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    pair_key: Mapped[str] = mapped_column(String(73), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    accepted_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
