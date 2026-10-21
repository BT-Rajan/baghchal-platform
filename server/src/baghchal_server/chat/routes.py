import uuid
from typing import Final

from fastapi import APIRouter, status

from baghchal_server.chat import service
from baghchal_server.chat.schemas import ChatIn, ChatMessageOut, ChatOut
from baghchal_server.deps import DB, CurrentUser, State, enforce_limit
from baghchal_server.games import service as games
from baghchal_server.ratelimit import Limit
from baghchal_server.realtime.protocol import ChatEvent

router = APIRouter(prefix="/api/v1")

MESSAGES_PER_USER: Final = Limit("chat", 20, 60)


@router.get("/games/{game_id}/chat")
async def read_chat(game_id: uuid.UUID, user: CurrentUser, state: State, db: DB) -> ChatOut:
    """The game's chat: whether it is open (players with accounts, both with messages on, no
    block, the game on or just over), and what has been said."""
    game = await games.get_game(db, game_id)
    return await service.read(db, game, user.id, state.clock())


@router.post("/games/{game_id}/chat", status_code=status.HTTP_201_CREATED)
async def send_chat(
    game_id: uuid.UUID, data: ChatIn, user: CurrentUser, state: State, db: DB
) -> ChatMessageOut:
    """Write to the other player. Blocked words are masked; both players get a ``chat`` event.
    Kept 30 days, so a report about it can be checked."""
    await enforce_limit(state, MESSAGES_PER_USER, str(user.id))
    game = await games.get_game(db, game_id)
    sent = await service.send(
        db, state.settings, game, user_id=user.id, text=data.text, now=state.clock()
    )
    event = ChatEvent(game_id=game.id, side=sent.side, text=sent.text, sent_at=sent.sent_at)
    for player in (game.goat_id, game.tiger_id):
        await state.hub.send(player, event.model_dump_json())
    return sent
