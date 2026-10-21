from typing import Final

from fastapi import APIRouter, status

from baghchal_server.accounts.models import User
from baghchal_server.deps import (
    DB,
    AppState,
    CurrentUser,
    Member,
    State,
    enforce_limit,
)
from baghchal_server.errors import AppError
from baghchal_server.friends import service
from baghchal_server.friends.schemas import FriendsOut, RelationOut
from baghchal_server.lobby import service as lobby
from baghchal_server.lobby.routes import with_status
from baghchal_server.lobby.schemas import PlayerOut, UsernameQuery
from baghchal_server.notifications import service as notifications
from baghchal_server.notifications.schemas import NotificationKind
from baghchal_server.ratelimit import Limit
from baghchal_server.realtime.protocol import FriendsEvent

router = APIRouter(prefix="/api/v1")

FRIENDS_PER_USER: Final = Limit("friend-change", 60, 3600)


async def _player(state: AppState, db: DB, username: str) -> User:
    player = await lobby.find_player(db, username, state.clock())
    if player is None:
        raise AppError(404, "player_not_found", "No such player.")
    return player


@router.get("/friends")
async def friends(user: CurrentUser, state: State, db: DB) -> FriendsOut:
    """My friends (with who is online), and the friend requests waiting on either side."""
    mine, incoming, outgoing = await service.lists(db, user.id, state.clock())
    listed = await with_status(state, db, [(u.id, u.username) for u in mine])
    return FriendsOut(
        friends=sorted(listed, key=lambda p: (not p.online, p.username.lower())),
        incoming=[PlayerOut(id=u.id, username=u.username) for u in incoming],
        outgoing=[PlayerOut(id=u.id, username=u.username) for u in outgoing],
    )


@router.post("/friends/{username}")
async def add_friend(username: UsernameQuery, user: Member, state: State, db: DB) -> RelationOut:
    """Ask a player to be friends, or accept their request. They hear of it at once."""
    await enforce_limit(state, FRIENDS_PER_USER, str(user.id))
    other = await _player(state, db, username)
    user_id, other_id = user.id, other.id
    before = await service.relation(db, user_id, other_id)
    relation = await service.request(db, state.clock(), user, other)
    await state.hub.send(other_id, FriendsEvent().model_dump_json())
    if relation != before:
        kind = (
            NotificationKind.FRIEND_ACCEPTED
            if relation == "friends"
            else NotificationKind.FRIEND_REQUEST
        )
        await notifications.notify(state, db, other_id, kind, actor_id=user_id)
    return RelationOut(relation=relation)


@router.delete("/friends/{username}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_friend(username: UsernameQuery, user: Member, state: State, db: DB) -> None:
    """Unfriend a player, or decline or cancel a friend request."""
    await enforce_limit(state, FRIENDS_PER_USER, str(user.id))
    other_id = (await _player(state, db, username)).id
    if await service.remove(db, user.id, other_id):
        await state.hub.send(other_id, FriendsEvent().model_dump_json())
