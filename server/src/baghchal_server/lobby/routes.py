import uuid
from typing import Annotated, Final

from fastapi import APIRouter, Query, status

from baghchal_server.deps import DB, AppState, CurrentUser, State, enforce_limit
from baghchal_server.errors import AppError
from baghchal_server.games import service as games
from baghchal_server.games.events import notify as notify_game
from baghchal_server.lobby import service
from baghchal_server.lobby.models import Challenge
from baghchal_server.lobby.schemas import (
    ChallengeIn,
    ChallengeList,
    ChallengeOut,
    PlayerStatusOut,
    ProfileOut,
    UsernameQuery,
)
from baghchal_server.ratelimit import Limit
from baghchal_server.realtime.protocol import ChallengeEvent

router = APIRouter(prefix="/api/v1")

SEARCH_PER_USER: Final = Limit("player-search", 60, 60)
CHALLENGES_PER_USER: Final = Limit("challenge-create", 30, 3600)


async def _with_status(
    state: AppState, db: DB, users: list[tuple[uuid.UUID, str]]
) -> list[PlayerStatusOut]:
    online = await state.presence.online(uid for uid, _ in users)
    playing = await games.busy(db, [uid for uid, _ in users])
    return [
        PlayerStatusOut(id=uid, username=name, online=uid in online, playing=uid in playing)
        for uid, name in users
    ]


async def _notify(state: AppState, db: DB, challenge: Challenge) -> ChallengeOut:
    """Tell both players (all their tabs and devices) about the challenge's new state."""
    (out,) = await service.describe(db, [challenge])
    message = ChallengeEvent(challenge=out).model_dump_json()
    for user_id in (challenge.challenger_id, challenge.opponent_id):
        await state.hub.send(user_id, message)
    return out


@router.get("/players")
async def search_players(
    prefix: Annotated[UsernameQuery, Query()],
    user: CurrentUser,
    state: State,
    db: DB,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[PlayerStatusOut]:
    """Players whose username starts with ``prefix`` (case-insensitive)."""
    await enforce_limit(state, SEARCH_PER_USER, str(user.id))
    found = await service.search_players(db, prefix, limit)
    return await _with_status(state, db, [(u.id, u.username) for u in found])


@router.get("/players/online")
async def online_players(
    user: CurrentUser, state: State, db: DB, limit: Annotated[int, Query(ge=1, le=100)] = 50
) -> list[PlayerStatusOut]:
    ids = await state.presence.list_online(limit)
    users = await service.users_by_id(db, ids)
    return await _with_status(
        state, db, [(uid, users[uid].username) for uid in ids if uid in users]
    )


@router.get("/players/{username}")
async def player_profile(
    username: UsernameQuery, user: CurrentUser, state: State, db: DB
) -> ProfileOut:
    player = await service.find_player(db, username)
    if player is None:
        raise AppError(404, "player_not_found", "No such player.")
    (status,) = await _with_status(state, db, [(player.id, player.username)])
    return ProfileOut(**status.model_dump(), created_at=player.created_at)


@router.get("/challenges")
async def list_challenges(user: CurrentUser, state: State, db: DB) -> ChallengeList:
    now = state.clock()
    described = await service.describe(db, await service.open_challenges(db, now, user))
    return ChallengeList(
        incoming=[c for c in described if c.opponent.id == user.id],
        outgoing=[c for c in described if c.challenger.id == user.id],
    )


@router.post("/challenges", status_code=status.HTTP_201_CREATED)
async def create_challenge(
    data: ChallengeIn, user: CurrentUser, state: State, db: DB
) -> ChallengeOut:
    await enforce_limit(state, CHALLENGES_PER_USER, str(user.id))
    challenge = await service.create_challenge(db, state.presence, state.clock(), user, data)
    return await _notify(state, db, challenge)


async def _respond(
    challenge_id: uuid.UUID, response: service.Response, user: CurrentUser, state: State, db: DB
) -> ChallengeOut:
    challenge, game = await service.respond(db, state.clock(), user.id, challenge_id, response)
    out = await _notify(state, db, challenge)
    if game is not None:
        await notify_game(state, db, game)
    return out


@router.post("/challenges/{challenge_id}/accept")
async def accept_challenge(
    challenge_id: uuid.UUID, user: CurrentUser, state: State, db: DB
) -> ChallengeOut:
    """Accept and start the game (its id is in ``game_id``; both players get a ``game`` event)."""
    return await _respond(challenge_id, "accept", user, state, db)


@router.post("/challenges/{challenge_id}/decline")
async def decline_challenge(
    challenge_id: uuid.UUID, user: CurrentUser, state: State, db: DB
) -> ChallengeOut:
    return await _respond(challenge_id, "decline", user, state, db)


@router.post("/challenges/{challenge_id}/cancel")
async def cancel_challenge(
    challenge_id: uuid.UUID, user: CurrentUser, state: State, db: DB
) -> ChallengeOut:
    return await _respond(challenge_id, "cancel", user, state, db)
