import uuid
from typing import Annotated, Final

from fastapi import APIRouter, Path, status

from baghchal_server.deps import DB, CurrentUser, State, enforce_limit
from baghchal_server.games.events import notify as notify_game
from baghchal_server.games.schemas import GameOut
from baghchal_server.notifications import service as notifications
from baghchal_server.notifications.schemas import NotificationKind
from baghchal_server.ratelimit import Limit
from baghchal_server.tournaments import progress, service
from baghchal_server.tournaments.schemas import AwardIn, TournamentIn, TournamentOut

router = APIRouter(prefix="/api/v1")

CREATES_PER_USER: Final = Limit("tournament-create", 10, 3600)
ACTIONS_PER_USER: Final = Limit("tournament-action", 120, 3600)

Code = Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,16}$")]


@router.post("/tournaments", status_code=status.HTTP_201_CREATED)
async def create_tournament(
    data: TournamentIn, user: CurrentUser, state: State, db: DB
) -> TournamentOut:
    """Host a Swiss tournament (Pro); share its code for players to join."""
    await enforce_limit(state, CREATES_PER_USER, str(user.id))
    now = state.clock()
    return await service.describe(db, now, await service.create(db, now, user, data))


@router.get("/tournaments")
async def my_tournaments(user: CurrentUser, state: State, db: DB) -> list[TournamentOut]:
    """Tournaments I am in, newest first."""
    now = state.clock()
    return [await service.describe(db, now, t) for t in await service.mine(db, user.id)]


@router.get("/tournaments/{code}")
async def tournament(code: Code, user: CurrentUser, state: State, db: DB) -> TournamentOut:
    return await service.describe(db, state.clock(), await service.find(db, code))


@router.post("/tournaments/{code}/join")
async def join_tournament(code: Code, user: CurrentUser, state: State, db: DB) -> TournamentOut:
    await enforce_limit(state, ACTIONS_PER_USER, str(user.id))
    now = state.clock()
    return await service.describe(db, now, await service.join(db, now, user, code))


@router.post("/tournaments/{code}/leave")
async def leave_tournament(code: Code, user: CurrentUser, state: State, db: DB) -> TournamentOut:
    return await service.describe(db, state.clock(), await service.leave(db, user.id, code))


@router.post("/tournaments/{code}/start")
async def start_tournament(code: Code, user: CurrentUser, state: State, db: DB) -> TournamentOut:
    """The host closes entries and draws up the games."""
    now = state.clock()
    user_id = user.id
    tournament = await service.start(db, now, user_id, code)
    out = await service.describe(db, now, tournament)
    for player in out.players:
        if player.id != user_id:
            await notifications.notify(
                state,
                db,
                player.id,
                NotificationKind.TOURNAMENT_STARTED,
                actor_id=user_id,
                ref=out.code,
            )
    return out


@router.post("/tournaments/{code}/finish")
async def finish_tournament(code: Code, user: CurrentUser, state: State, db: DB) -> TournamentOut:
    """The host ends the tournament now."""
    now = state.clock()
    return await service.describe(db, now, await service.finish(db, now, user.id, code))


@router.post("/tournaments/{code}/pairings/{pairing_id}/award")
async def award_pairing(  # noqa: PLR0913, PLR0917 - FastAPI dependencies
    code: Code, pairing_id: uuid.UUID, data: AwardIn, user: CurrentUser, state: State, db: DB
) -> TournamentOut:
    """The host gives this round's unplayed game to the player who turned up (a point), so
    the round can move on."""
    tournament = await service.award(db, user.id, code, pairing_id, data.winner)
    await progress.moved_on(state, db, [tournament])
    return await service.describe(db, state.clock(), tournament)


@router.post("/tournaments/{code}/pairings/{pairing_id}/play")
async def play_pairing(
    code: Code, pairing_id: uuid.UUID, user: CurrentUser, state: State, db: DB
) -> GameOut:
    """Start one of my games; my opponent must be online (both get a ``game`` event)."""
    await enforce_limit(state, ACTIONS_PER_USER, str(user.id))
    game = await service.play(db, state.presence, state.clock(), user, code, pairing_id)
    return await notify_game(state, db, game)
