import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, Index, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from baghchal_server.db import MYSQL_TABLE_ARGS, Base, UTCDateTime


class PlayerRating(Base):
    """A player's Glicko-2 rating in one category (blitz, rapid). Created on the first rated
    game; until then a player has the default rating."""

    __tablename__ = "ratings"
    __table_args__ = (
        Index("ix_ratings_category_rating", "category", "rating"),
        MYSQL_TABLE_ARGS,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    category: Mapped[str] = mapped_column(String(8), primary_key=True)
    rating: Mapped[float] = mapped_column(Float)
    deviation: Mapped[float] = mapped_column(Float)
    volatility: Mapped[float] = mapped_column(Float)
    games: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)
    """When the rating last changed: the start of the current idle period."""
