import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from baghchal_server.db import MYSQL_TABLE_ARGS, Base, UTCDateTime


class ChatMessage(Base):
    """A message one player wrote to the other in a game. Kept 30 days (housekeeping), so a
    report about it can be checked."""

    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("ix_chat_messages_game_id_created_at", "game_id", "created_at"),
        Index("ix_chat_messages_created_at", "created_at"),
        MYSQL_TABLE_ARGS,
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    game_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("games.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    text: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
