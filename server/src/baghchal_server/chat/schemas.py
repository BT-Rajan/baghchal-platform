import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

from baghchal_server.games.schemas import SideName

MAX_LENGTH = 200

ChatText = Annotated[str, StringConstraints(min_length=1, max_length=MAX_LENGTH)]


class ChatIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: ChatText


class ChatMessageOut(BaseModel):
    side: SideName
    """Who wrote it."""
    text: str
    sent_at: datetime


ChatClosed = Literal["computer", "guest", "under_18", "messages_off", "blocked", "game_over"]


class ChatOut(BaseModel):
    """A game's chat, as one of its players sees it."""

    open: bool
    """Whether messages can be sent now."""
    closed_because: ChatClosed | None
    """Why not: against the computer, a guest or a player under 18 in the game, either player
    has messages off, a block between them, or the game ended a while ago."""
    messages: list[ChatMessageOut]


class ModChatMessageOut(BaseModel):
    username: str
    text: str
    sent_at: datetime


class ModChatOut(BaseModel):
    game_id: uuid.UUID
    messages: list[ModChatMessageOut]
