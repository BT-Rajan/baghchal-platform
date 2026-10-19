import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from baghchal_server.db import MYSQL_TABLE_ARGS, Base, UTCDateTime


class ReportReason(StrEnum):
    CHEATING = "cheating"
    ABUSE = "abuse"
    USERNAME = "username"
    """An offensive username."""
    OTHER = "other"


class ReportStatus(StrEnum):
    OPEN = "open"
    DISMISSED = "dismissed"
    ACTIONED = "actioned"


class Report(Base):
    """A report about a player, for moderators to look at: from another player, or automatic
    (the fair-play checks, with no reporter).

    ``open_key`` is set only while the report is open and is unique, so a player has at most
    one open report about the same person.
    """

    __tablename__ = "reports"
    __table_args__ = (
        Index("ix_reports_status_created_at", "status", "created_at"),
        Index("ix_reports_target_id_status", "target_id", "status"),
        MYSQL_TABLE_ARGS,
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    reporter_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    """None for an automatic report (the fair-play checks)."""
    target_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    game_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("games.id", ondelete="SET NULL")
    )
    reason: Mapped[str] = mapped_column(String(16))
    details: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(16))
    open_key: Mapped[str | None] = mapped_column(String(73), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )


class ActionKind(StrEnum):
    SUSPEND = "suspend"
    UNSUSPEND = "unsuspend"
    RENAME = "rename"
    DISMISS_REPORT = "dismiss_report"
    GRANT = "grant"
    """An admin gave a plan or a feature (billing)."""
    REVOKE = "revoke"


class ModerationAction(Base):
    """What a moderator did, and why: the audit log."""

    __tablename__ = "moderation_actions"
    __table_args__ = (
        Index("ix_moderation_actions_target_id_created_at", "target_id", "created_at"),
        MYSQL_TABLE_ARGS,
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    moderator_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    target_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    action: Mapped[str] = mapped_column(String(16))
    reason: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
