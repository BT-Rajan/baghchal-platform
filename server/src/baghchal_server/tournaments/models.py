import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from baghchal_server.db import MYSQL_TABLE_ARGS, Base, UTCDateTime


class Tournament(Base):
    """A Swiss tournament among friends, hosted by a Pro player and joined by invitation."""

    __tablename__ = "tournaments"
    __table_args__ = MYSQL_TABLE_ARGS

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(16), unique=True)
    name: Mapped[str] = mapped_column(String(60))
    host_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    time_control: Mapped[str] = mapped_column(String(8))
    max_players: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10))
    rounds: Mapped[int] = mapped_column(Integer, server_default="1")
    """How many rounds, set when it starts (tournaments from before Swiss: their one round
    robin, as round 1)."""
    round: Mapped[int] = mapped_column(Integer, server_default="1")
    """The round being played (0 before the start)."""
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class Entry(Base):
    """A player in a tournament."""

    __tablename__ = "tournament_players"
    __table_args__ = (
        Index("ix_tournament_players_user_id", "user_id"),
        MYSQL_TABLE_ARGS,
    )

    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    joined_at: Mapped[datetime] = mapped_column(UTCDateTime)
    withdrawn_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    """When they left a running tournament (account deleted, or banned): their results stay
    in the standings, but they are paired no more."""


class Pairing(Base):
    """One game of a round: who plays goats, who plays tigers, and the game once started (an
    aborted game leaves the pairing to be played again). With no tiger, it is a bye: the
    player in ``goat_id`` sits the round out and scores a point."""

    __tablename__ = "tournament_pairings"
    __table_args__ = (
        Index("ix_tournament_pairings_tournament_id", "tournament_id"),
        Index("ix_tournament_pairings_game_id", "game_id"),
        MYSQL_TABLE_ARGS,
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tournament_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tournaments.id", ondelete="CASCADE")
    )
    round: Mapped[int] = mapped_column(Integer, server_default="1")
    goat_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    tiger_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE")
    )
    game_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("games.id", ondelete="SET NULL")
    )
    forfeit_to: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE")
    )
    """Won without a game: the host gave it to the player who turned up, or the other left
    (account deleted, banned) or blocked them."""
