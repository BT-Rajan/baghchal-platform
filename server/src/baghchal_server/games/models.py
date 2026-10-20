import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import JSON, Boolean, ForeignKey, Index, Integer, String, UniqueConstraint, Uuid
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
    DRAW_AGREED = "draw_agreed"
    """A draw: one player offered it and the other accepted (no winner, half a point each)."""


class Game(Base):
    """A live game. ``ply`` counts moves played and doubles as the version for updates."""

    __tablename__ = "games"
    __table_args__ = (
        Index("ix_games_status_deadline_at", "status", "deadline_at"),
        Index("ix_games_aborted_by_finished_at", "aborted_by", "finished_at"),
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
    lag_ms: Mapped[int] = mapped_column(Integer, default=0)
    """Network delay allowed to the side to move this turn: never charged to their clock."""
    aborted_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    """Who caused an abort: the player who aborted, or the side that did not make a first
    move in time. Too many aborts in a day keep a player from starting new games for a while."""
    draw_offer: Mapped[str | None] = mapped_column(String(8))
    """The side whose draw offer is open: it lapses when the other side moves."""
    goat_offer_ply: Mapped[int | None] = mapped_column(Integer)
    tiger_offer_ply: Mapped[int | None] = mapped_column(Integer)
    """When each side last offered a draw, so offers cannot be repeated move after move."""
    bot_level: Mapped[str | None] = mapped_column(String(8))
    """For a game against the computer: its level (``easy``, ``medium``, ``hard``)."""
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


class Analysis(Base):
    """The engine's review of a finished game, kept so it is worked out once."""

    __tablename__ = "analyses"
    __table_args__ = MYSQL_TABLE_ARGS

    game_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("games.id", ondelete="CASCADE"), primary_key=True
    )
    moves: Mapped[list[dict[str, object]]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class AnalysisUse(Base):
    """A player had a game analysed: what the daily allowance counts."""

    __tablename__ = "analysis_uses"
    __table_args__ = (
        UniqueConstraint("user_id", "game_id", name="uq_analysis_uses_user_id_game_id"),
        Index("ix_analysis_uses_user_id_created_at", "user_id", "created_at"),
        MYSQL_TABLE_ARGS,
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    game_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("games.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
