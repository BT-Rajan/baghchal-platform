import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from baghchal_server.db import MYSQL_TABLE_ARGS, Base, UTCDateTime


class Grant(Base):
    """A plan or a single feature given to a player by an admin, for a while or for good.

    Exactly one of ``plan`` and ``feature`` is set. Grants are never deleted: revoking one sets
    ``revoked_at``, so the record of who gave what, when and why stays.
    """

    __tablename__ = "grants"
    __table_args__ = (
        Index("ix_grants_user_id_created_at", "user_id", "created_at"),
        MYSQL_TABLE_ARGS,
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    plan: Mapped[str | None] = mapped_column(String(16))
    feature: Mapped[str | None] = mapped_column(String(32))
    starts_at: Mapped[datetime] = mapped_column(UTCDateTime)
    ends_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    """None: until revoked."""
    reason: Mapped[str] = mapped_column(String(500))
    granted_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    revoked_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
