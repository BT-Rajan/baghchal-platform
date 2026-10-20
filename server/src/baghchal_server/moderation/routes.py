import uuid
from typing import Annotated, Final

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status

from baghchal_server.accounts.models import User
from baghchal_server.accounts.schemas import Accepted
from baghchal_server.accounts.service import STAFF
from baghchal_server.chat import service as chat
from baghchal_server.chat.schemas import ModChatOut
from baghchal_server.deps import DB, AppState, CurrentUser, Member, State, enforce_limit
from baghchal_server.errors import AppError
from baghchal_server.games import service as games
from baghchal_server.games.events import notify as notify_game
from baghchal_server.lobby.routes import notify_challenge
from baghchal_server.lobby.schemas import UsernameQuery
from baghchal_server.mail import Mail, deliver
from baghchal_server.moderation import service
from baghchal_server.moderation.models import ReportStatus
from baghchal_server.moderation.schemas import (
    ModPlayerOut,
    ReasonIn,
    RenameIn,
    ReportIn,
    ReportOut,
    SuspendIn,
)
from baghchal_server.ratelimit import Limit

router = APIRouter(prefix="/api/v1")

REPORTS_PER_USER: Final = Limit("report", 20, 86400)


async def get_moderator(user: CurrentUser) -> User:
    if user.role not in STAFF:
        raise AppError(403, "not_a_moderator", "Only moderators can do this.")
    return user


Moderator = Annotated[User, Depends(get_moderator)]


def _send(tasks: BackgroundTasks, state: AppState, mail: Mail) -> None:
    tasks.add_task(deliver, state.mailer, mail)


@router.post("/players/{username}/report", status_code=status.HTTP_202_ACCEPTED)
async def report_player(
    username: UsernameQuery, data: ReportIn, user: Member, state: State, db: DB
) -> Accepted:
    """Ask the moderators to look at a player (cheating, abuse, an offensive name…)."""
    await enforce_limit(state, REPORTS_PER_USER, str(user.id))
    await service.report(db, state.clock(), user, username, data)
    return Accepted()


# ── For moderators ────────────────────────────────────────────────────────


@router.get("/mod/reports")
async def list_reports(
    _: Moderator,
    db: DB,
    report_status: Annotated[ReportStatus, Query(alias="status")] = ReportStatus.OPEN,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[ReportOut]:
    """Open reports oldest first (the queue), or closed ones newest first."""
    return await service.list_reports(db, report_status, limit)


@router.post("/mod/reports/{report_id}/dismiss")
async def dismiss_report(
    report_id: uuid.UUID, data: ReasonIn, moderator: Moderator, state: State, db: DB
) -> ReportOut:
    """Close a report without acting on the player."""
    return await service.dismiss(db, state.clock(), moderator, report_id, data.reason)


@router.get("/mod/games/{game_id}/chat")
async def game_chat(game_id: uuid.UUID, _: Moderator, db: DB) -> ModChatOut:
    """What was written in a game (kept 30 days), for checking a report about it."""
    return await chat.for_moderators(db, await games.get_game(db, game_id))


@router.get("/mod/players/{username}")
async def player_record(username: UsernameQuery, _: Moderator, db: DB) -> ModPlayerOut:
    """A player's state, the reports about them and what moderators did."""
    return await service.record(db, await service.find_any(db, username))


@router.post("/mod/players/{username}/suspend")
async def suspend_player(  # noqa: PLR0913, PLR0917 - FastAPI dependencies
    username: UsernameQuery,
    data: SuspendIn,
    moderator: Moderator,
    tasks: BackgroundTasks,
    state: State,
    db: DB,
) -> ModPlayerOut:
    """Suspend a player for some days, or ban them (``days: null``)."""
    target = await service.find_any(db, username)
    now = state.clock()
    closed, mail = await service.suspend(
        db, now, moderator, target, days=data.days, reason=data.reason
    )
    for challenge in closed:
        await notify_challenge(state, db, challenge)
    # Their live game ends as a resignation. Resigning game 1 of a match starts game 2, so
    # look again until nothing is left.
    while live := await games.active_games(db, target.id):
        for game in live:
            await notify_game(state, db, await games.resign(db, game.id, target.id, now))
    _send(tasks, state, mail)
    return await service.record(db, target)


@router.post("/mod/players/{username}/unsuspend")
async def unsuspend_player(  # noqa: PLR0913, PLR0917 - FastAPI dependencies
    username: UsernameQuery,
    data: ReasonIn,
    moderator: Moderator,
    tasks: BackgroundTasks,
    state: State,
    db: DB,
) -> ModPlayerOut:
    target = await service.find_any(db, username)
    _send(tasks, state, await service.unsuspend(db, state.clock(), moderator, target, data.reason))
    return await service.record(db, target)


@router.post("/mod/players/{username}/rename")
async def rename_player(  # noqa: PLR0913, PLR0917 - FastAPI dependencies
    username: UsernameQuery,
    data: RenameIn,
    moderator: Moderator,
    tasks: BackgroundTasks,
    state: State,
    db: DB,
) -> ModPlayerOut:
    """Give a player a new username, for one that breaks the rules."""
    target = await service.find_any(db, username)
    mail = await service.rename(
        db,
        state.settings,
        state.clock(),
        moderator,
        target,
        username=data.username,
        reason=data.reason,
    )
    _send(tasks, state, mail)
    return await service.record(db, target)
