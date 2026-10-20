import contextlib
from typing import Final

from fastapi import APIRouter, BackgroundTasks, Request

from baghchal_server.accounts import service as accounts
from baghchal_server.accounts.routes import describe_me
from baghchal_server.accounts.schemas import MeOut
from baghchal_server.deps import DB, CurrentUser, State, client_ip, enforce_limit
from baghchal_server.errors import AppError
from baghchal_server.games import service as games
from baghchal_server.games.events import notify
from baghchal_server.legal import age, consents, service
from baghchal_server.legal.documents import VERSIONS, Document, render
from baghchal_server.legal.schemas import (
    ConsentsIn,
    DocumentOut,
    ParentDecisionIn,
    ParentLinkIn,
    ParentLinkOut,
    VersionsOut,
)
from baghchal_server.lobby.routes import notify_challenge
from baghchal_server.mail import deliver
from baghchal_server.ratelimit import Limit

router = APIRouter(prefix="/api/v1")

PARENT_LINKS_PER_IP: Final = Limit("parent-link-ip", 60, 3600)


@router.get("/legal")
async def versions() -> VersionsOut:
    """The current versions of the terms and the privacy policy (what sign-up must accept)."""
    return VersionsOut(terms=VERSIONS[Document.TERMS], privacy=VERSIONS[Document.PRIVACY])


@router.get("/legal/{document}")
async def document(document: Document, state: State) -> DocumentOut:
    """The terms or the privacy policy, for anyone to read."""
    return DocumentOut(
        document=document, version=VERSIONS[document], text=render(document, state.settings)
    )


@router.post("/me/consents")
async def accept(
    data: ConsentsIn, user: CurrentUser, tasks: BackgroundTasks, state: State, db: DB
) -> MeOut:
    """Accept the current terms and privacy policy (asked again after they change), and give
    the month of birth if the account predates that question."""
    now = state.clock()
    consents.check_versions(data.terms_version, data.privacy_version)
    if user.age_checked_at is None:
        if data.birth_month is None:
            raise AppError(422, "birth_month_required", "Please give your month of birth.")
        adult = age.check(
            data.birth_month, data.parent_email, user.email, now, guest=user.role == "guest"
        )
        if age.apply(user, adult, data.parent_email, now):
            mail = await accounts.ask_parent(db, state.settings, user, now)
            tasks.add_task(deliver, state.mailer, mail)
    await consents.record(db, user.id, now)
    await db.commit()
    return await describe_me(db, user, now)


@router.post("/parent-consent/look-up")
async def look_up(data: ParentLinkIn, request: Request, state: State, db: DB) -> ParentLinkOut:
    """Who a parent's link is about, before they decide."""
    await enforce_limit(state, PARENT_LINKS_PER_IP, client_ip(request))
    user = await service.look_up(db, data.token, state.clock())
    return ParentLinkOut(
        username=user.username,
        status=user.parent_consent,
        adult_from=user.adult_from,
    )


@router.post("/parent-consent")
async def decide(
    data: ParentDecisionIn, request: Request, tasks: BackgroundTasks, state: State, db: DB
) -> ParentLinkOut:
    """A parent or guardian agrees, refuses, or withdraws an earlier agreement (which deletes
    the account)."""
    await enforce_limit(state, PARENT_LINKS_PER_IP, client_ip(request))
    child = await service.look_up(db, data.token, state.clock())
    username = child.username
    if data.decision == "refuse":  # the account goes now: a live game is resigned first
        for game in await games.active_games(db, child.id):
            with contextlib.suppress(AppError):  # it ended meanwhile
                await notify(state, db, await games.resign(db, game.id, child.id, state.clock()))
    user, closed, mails = await service.decide(
        db, state.settings, state.clock(), data.token, agree=data.decision == "agree"
    )
    for challenge in closed:
        await notify_challenge(state, db, challenge)
    for mail in mails:
        tasks.add_task(deliver, state.mailer, mail)
    if data.decision == "refuse":
        return ParentLinkOut(username=username, status="deleted", adult_from=None)
    return ParentLinkOut(username=user.username, status="given", adult_from=user.adult_from)
