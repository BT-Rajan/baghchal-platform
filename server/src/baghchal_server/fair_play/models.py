import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import Float, ForeignKey, Index, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from baghchal_server.db import MYSQL_TABLE_ARGS, Base, UTCDateTime


class CheckStatus(StrEnum):
    PENDING = "pending"
    DONE = "done"
    FAILED = "failed"
    """Gave up after MAX_ATTEMPTS."""
    SKIPPED = "skipped"
    """Waited too long in the queue."""


class Stage(StrEnum):
    SCREEN = "screen"
    """The quick review every checked game gets."""
    CONFIRM = "confirm"
    """The deep review, only for players the screen picked out."""


class FairPlayCheck(Base):
    """A rated game waiting for (or done with) its fair-play check. Queued in the transaction
    that rates the game, so no finished rated game can miss its check."""

    __tablename__ = "fair_play_checks"
    __table_args__ = (
        Index("ix_fair_play_checks_status_created_at", "status", "created_at"),
        MYSQL_TABLE_ARGS,
    )

    game_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("games.id", ondelete="CASCADE"), primary_key=True
    )
    status: Mapped[str] = mapped_column(String(8))
    attempts: Mapped[int] = mapped_column(Integer)
    claimed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    """When a server took it; another may take it again once this is old (the server died)."""
    checked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class FairPlaySide(Base):
    """One player's figures in one game, from one stage's review (see baghchal_engine.fair_play)."""

    __tablename__ = "fair_play_sides"
    __table_args__ = (
        Index("ix_fair_play_sides_user_id_stage_created_at", "user_id", "stage", "created_at"),
        MYSQL_TABLE_ARGS,
    )

    game_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("games.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    stage: Mapped[str] = mapped_column(String(8), primary_key=True)
    side: Mapped[str] = mapped_column(String(8))
    moves: Mapped[int] = mapped_column(Integer)
    decisive: Mapped[int] = mapped_column(Integer)
    agreed: Mapped[int] = mapped_column(Integer)
    decisive_loss: Mapped[int] = mapped_column(Integer)
    mistakes: Mapped[int] = mapped_column(Integer)
    blunders: Mapped[int] = mapped_column(Integer)
    think_median_ms: Mapped[int] = mapped_column(Integer)
    think_spread: Mapped[float] = mapped_column(Float)
    """Standard deviation of think times over their mean: low means machine-like regularity."""
    fast_moves: Mapped[int] = mapped_column(Integer)
    """Moves made in under a second."""
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    """When the game was checked: the window is the latest checks."""
