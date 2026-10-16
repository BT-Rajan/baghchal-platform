import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from baghchal_server.db import MYSQL_TABLE_ARGS, Base, UTCDateTime


class GameStatus(StrEnum):
    ACTIVE = "active"
    FINISHED = "finished"


class EndReason(StrEnum):
    # Decided on the board (see docs/rules.md).
    FIVE_CAPTURED = "five_captured"
    TIGERS_TRAPPED = "tigers_trapped"
    GOATS_BLOCKED = "goats_blocked"
    # Decided by the server.
    TIMEOUT = "timeout"
    RESIGNED = "resigned"
    ABANDONED = "abandoned"
    ABORTED = "aborted"
    """No result: a player did not make a first move in time, or someone aborted early."""


class Game(Base):
    """A live game. ``ply`` counts moves played and doubles as the version for updates."""

    __tablename__ = "games"
    __table_args__ = (
        Index("ix_games_status_deadline_at", "status", "deadline_at"),
        MYSQL_TABLE_ARGS,
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    challenge_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("challenges.id", ondelete="CASCADE"), unique=True
    )
    """The accepted challenge; None for the second game of a match."""
    match_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("matches.id", ondelete="CASCADE"), index=True
    )
    match_game: Mapped[int | None] = mapped_column(Integer)
    """1 or 2 within a rated match."""
    goat_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    tiger_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    rated: Mapped[bool] = mapped_column(Boolean)
    initial_ms: Mapped[int] = mapped_column(Integer)
    increment_ms: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16))
    winner: Mapped[str | None] = mapped_column(String(8))
    end_reason: Mapped[str | None] = mapped_column(String(16))
    ply: Mapped[int] = mapped_column(Integer)
    position: Mapped[str] = mapped_column(String(40))
    """BFEN of the current position, so readers need not replay the moves."""
    goat_ms: Mapped[int] = mapped_column(Integer)
    tiger_ms: Mapped[int] = mapped_column(Integer)
    """Time left for each side as of ``turn_started_at`` (the side to move is running since)."""
    turn_started_at: Mapped[datetime] = mapped_column(UTCDateTime)
    deadline_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    """When the side to move runs out of time (or of first-move grace); None once finished."""
    goat_rating: Mapped[int] = mapped_column(Integer)
    tiger_rating: Mapped[int] = mapped_column(Integer)
    """Each player's rating in this time control when the game started (shown to players)."""
    goat_rating_change: Mapped[int | None] = mapped_column(Integer)
    tiger_rating_change: Mapped[int | None] = mapped_column(Integer)
    """Set when a rated game ends with a result."""
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class MatchStatus(StrEnum):
    ACTIVE = "active"
    FINISHED = "finished"


class Match(Base):
    """A rated match: two games between the same players with sides swapped, so neither
    player's rating depends on which side they happened to get."""

    __tablename__ = "matches"
    __table_args__ = MYSQL_TABLE_ARGS

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    challenge_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("challenges.id", ondelete="CASCADE"), unique=True
    )
    status: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class GameMove(Base):
    """One move. The (game, ply) primary key makes a move impossible to record twice."""

    __tablename__ = "game_moves"
    __table_args__ = MYSQL_TABLE_ARGS

    game_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("games.id", ondelete="CASCADE"), primary_key=True
    )
    ply: Mapped[int] = mapped_column(Integer, primary_key=True)
    notation: Mapped[str] = mapped_column(String(8))
    played_at: Mapped[datetime] = mapped_column(UTCDateTime)
    think_ms: Mapped[int] = mapped_column(Integer)
    clock_ms: Mapped[int] = mapped_column(Integer)
    """The mover's time left after the move, increment included."""


class ActiveGame(Base):
    """One row per player in a live game; the primary key allows one live game per player."""

    __tablename__ = "active_games"
    __table_args__ = MYSQL_TABLE_ARGS

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    game_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("games.id", ondelete="CASCADE"), index=True
    )
