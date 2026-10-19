import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from baghchal_server.db import MYSQL_TABLE_ARGS, Base, UTCDateTime


class Consent(Base):
    """A player accepted this version of the terms or of the privacy policy."""

    __tablename__ = "consents"
    __table_args__ = MYSQL_TABLE_ARGS

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    document: Mapped[str] = mapped_column(String(8), primary_key=True)
    version: Mapped[str] = mapped_column(String(16), primary_key=True)
    accepted_at: Mapped[datetime] = mapped_column(UTCDateTime)
