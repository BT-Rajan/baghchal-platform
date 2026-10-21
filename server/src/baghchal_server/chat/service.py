"""Free chat in games: for two players with accounts who both have messages on, during the game
and a few minutes after it. Blocked words are masked; messages are kept 30 days so reports
about them can be checked (legal/texts/privacy.md), then deleted (housekeeping)."""

import re
import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import User
from baghchal_server.accounts.service import GUEST
from baghchal_server.appearance import service as appearance
from baghchal_server.chat.models import ChatMessage
from baghchal_server.chat.schemas import (
    ChatClosed,
    ChatMessageOut,
    ChatOut,
    ModChatMessageOut,
    ModChatOut,
)
from baghchal_server.config import Settings
from baghchal_server.errors import AppError
from baghchal_server.games.models import Game
from baghchal_server.lobby import service as lobby

KEPT: Final = timedelta(days=30)
"""How long messages are kept (the privacy policy says so)."""
AFTER_GAME: Final = timedelta(minutes=5)
"""Chat stays open this long after a game ends ("Good game!"), as quick messages do."""

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_SPACES = re.compile(r"\s+")


def clean(settings: Settings, text: str) -> str:
    """One line of text, with control characters gone and blocked words masked."""
    text = _SPACES.sub(" ", _CONTROL.sub(" ", text)).strip()
    for word in settings.blocked_username_words:
        if word:
            text = re.sub(re.escape(word), "*" * len(word), text, flags=re.IGNORECASE)
    return text


async def _closed_because(
    db: AsyncSession, game: Game, user_id: uuid.UUID, now: datetime
) -> ChatClosed | None:
    """Why chat is closed in this game, checked in this order (None: it is open)."""
    if game.bot_level is not None:
        return "computer"
    users = list(await db.scalars(select(User).where(User.id.in_([game.goat_id, game.tiger_id]))))
    other = game.tiger_id if user_id == game.goat_id else game.goat_id
    messages_on = [(await appearance.mine(db, u.id, now)).emotes_on for u in users]
    blocked = await lobby.has_blocked(db, user_id, other) or await lobby.has_blocked(
        db, other, user_id
    )
    reasons: list[tuple[ChatClosed, bool]] = [
        ("guest", any(u.role == GUEST for u in users)),
        ("messages_off", not all(messages_on)),
        ("blocked", blocked),
        ("game_over", game.finished_at is not None and now - game.finished_at > AFTER_GAME),
    ]
    return next((reason for reason, applies in reasons if applies), None)


def _player_game(game: Game, user_id: uuid.UUID) -> None:
    if user_id not in (game.goat_id, game.tiger_id):
        raise AppError(403, "not_your_game", "You are not playing in this game.")


async def read(db: AsyncSession, game: Game, user_id: uuid.UUID, now: datetime) -> ChatOut:
    """The game's chat for one of its players. Messages are shown only while chat is allowed
    between the two (a block or turning messages off hides them)."""
    _player_game(game, user_id)
    closed = await _closed_because(db, game, user_id, now)
    shown = closed in (None, "game_over")
    rows: Sequence[ChatMessage] = (
        (
            await db.scalars(
                select(ChatMessage)
                .where(ChatMessage.game_id == game.id)
                .order_by(ChatMessage.created_at, ChatMessage.id)
            )
        ).all()
        if shown
        else []
    )
    return ChatOut(
        open=closed is None,
        closed_because=closed,
        messages=[
            ChatMessageOut(
                side="goat" if m.user_id == game.goat_id else "tiger",
                text=m.text,
                sent_at=m.created_at,
            )
            for m in rows
        ],
    )


async def send(  # noqa: PLR0913 - who writes what in which game, when
    db: AsyncSession,
    settings: Settings,
    game: Game,
    *,
    user_id: uuid.UUID,
    text: str,
    now: datetime,
) -> ChatMessageOut:
    """Keep a message and return it (the caller tells both players)."""
    _player_game(game, user_id)
    closed = await _closed_because(db, game, user_id, now)
    if closed is not None:
        raise AppError(409, "chat_closed", "Chat is not open in this game.")
    text = clean(settings, text)
    if not text:
        raise AppError(422, "empty_message", "Write something first.")
    db.add(ChatMessage(game_id=game.id, user_id=user_id, text=text, created_at=now))
    await db.commit()
    return ChatMessageOut(
        side="goat" if user_id == game.goat_id else "tiger", text=text, sent_at=now
    )


async def for_moderators(db: AsyncSession, game: Game) -> ModChatOut:
    """Everything said in a game (while kept), for checking a report."""
    rows = await db.execute(
        select(ChatMessage, User.username)
        .join(User, User.id == ChatMessage.user_id)
        .where(ChatMessage.game_id == game.id)
        .order_by(ChatMessage.created_at, ChatMessage.id)
    )
    return ModChatOut(
        game_id=game.id,
        messages=[
            ModChatMessageOut(username=name, text=m.text, sent_at=m.created_at)
            for m, name in rows.all()
        ],
    )
