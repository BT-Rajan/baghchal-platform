import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from baghchal_server.db import MYSQL_TABLE_ARGS, Base, UTCDateTime


class User(Base):
    __tablename__ = "users"
    __table_args__ = MYSQL_TABLE_ARGS

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(20))
    """As the player typed it; shown to others."""
    username_key: Mapped[str] = mapped_column(String(20), unique=True)
    """Lower-cased username, for case-insensitive uniqueness and lookup."""
    email: Mapped[str] = mapped_column(String(254))
    email_key: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    email_verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)


class Session(Base):
    """A signed-in device. Only the SHA-256 of the token is stored."""

    __tablename__ = "sessions"
    __table_args__ = MYSQL_TABLE_ARGS

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    last_used_at: Mapped[datetime] = mapped_column(UTCDateTime)


class EmailToken(Base):
    """A single-use token sent by email. Only the SHA-256 of the token is stored."""

    __tablename__ = "email_tokens"
    __table_args__ = MYSQL_TABLE_ARGS

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    purpose: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    used_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
