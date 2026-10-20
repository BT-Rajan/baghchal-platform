"""Shared request dependencies: application state, database session, current user, limits."""

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Annotated, Final, Literal

from fastapi import Depends, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from starlette.requests import HTTPConnection

from baghchal_server.accounts.models import User
from baghchal_server.accounts.service import resolve_session
from baghchal_server.config import Settings
from baghchal_server.errors import AppError
from baghchal_server.legal import consents
from baghchal_server.legal.age import plays_people
from baghchal_server.mail import Mailer
from baghchal_server.metrics import Metrics
from baghchal_server.ratelimit import Limit, RateLimiter
from baghchal_server.realtime.hub import Hub
from baghchal_server.realtime.presence import Presence
from baghchal_server.security import PasswordHasher

if TYPE_CHECKING:
    from baghchal_server.fair_play.worker import FairPlayChecker
    from baghchal_server.games.computer import ComputerPlayers
    from baghchal_server.payments.keys import Gateways


@dataclass(frozen=True, slots=True)
class AppState:
    settings: Settings
    engine: AsyncEngine
    sessions: async_sessionmaker[AsyncSession]
    hasher: PasswordHasher
    limiter: RateLimiter
    mailer: Mailer
    clock: Callable[[], datetime]
    redis: "Redis | None"
    hub: Hub
    presence: Presence
    metrics: Metrics
    computer: "ComputerPlayers"
    fair_play: "FairPlayChecker"
    gateways: "Gateways"
    """Razorpay, for the keys an admin entered (see ``payments.keys``)."""


def get_state(request: Request) -> AppState:
    state: AppState = request.app.state.ctx
    return state


State = Annotated[AppState, Depends(get_state)]


async def get_db(state: State) -> AsyncIterator[AsyncSession]:
    async with state.sessions() as session:
        yield session


DB = Annotated[AsyncSession, Depends(get_db)]


def session_token(
    request: HTTPConnection, settings: Settings
) -> tuple[str | None, Literal["cookie", "bearer"]]:
    """The session token from ``Authorization: Bearer`` (apps) or the session cookie (web)."""
    scheme, _, credentials = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() == "bearer" and credentials.strip():
        return credentials.strip(), "bearer"
    return request.cookies.get(settings.session_cookie_name), "cookie"


UNAGREED_MAY: Final = frozenset(
    {"/api/v1/me/consents", "/api/v1/auth/logout", "/api/v1/me/delete", "/api/v1/me/claim"}
)
"""What a player may still change before answering the age question or accepting changed
terms: answer them, or leave."""


async def get_current_user(request: Request, state: State, db: DB) -> User:
    token, _ = session_token(request, state.settings)
    user = await resolve_session(db, token, state.clock()) if token else None
    if user is None:
        raise AppError(401, "not_authenticated", "Please sign in.")
    if request.method not in {"GET", "HEAD"} and request.url.path not in UNAGREED_MAY:
        if user.age_checked_at is None:
            raise AppError(403, "age_needed", "Please give your month and year of birth first.")
        if await consents.needed(db, user.id):
            raise AppError(
                403, "consents_needed", "Please accept the updated terms and privacy policy first."
            )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_member(user: CurrentUser) -> User:
    """A signed-in player with an account (not a guest)."""
    if user.role == "guest":
        raise AppError(403, "account_required", "Make a free account to do this.")
    return user


Member = Annotated[User, Depends(get_member)]


async def get_people_player(user: CurrentUser, state: State) -> User:
    """A signed-in player who may play other people: not a player under 18 whose parent has
    not agreed yet (they play the computer meanwhile)."""
    if not plays_people(user, state.clock()):
        raise AppError(
            403,
            "parent_consent_needed",
            "A parent or guardian needs to agree before you play other people. You can play "
            "the computer meanwhile.",
        )
    return user


PeoplePlayer = Annotated[User, Depends(get_people_player)]


def client_ip(request: Request) -> str:
    # Behind a proxy, run uvicorn with --proxy-headers and --forwarded-allow-ips so that this
    # is the real client address rather than the proxy's.
    return request.client.host if request.client else "unknown"


async def enforce_limit(state: AppState, limit: Limit, key: str) -> None:
    retry_after = await state.limiter.hit(limit, key)
    if retry_after:
        state.metrics.rate_limited.labels(limit.name).inc()
        raise AppError(
            429,
            "rate_limited",
            "Too many attempts. Please wait and try again.",
            headers={"Retry-After": str(retry_after)},
        )
