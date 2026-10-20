import contextlib
import time
from datetime import datetime
from typing import Final

from fastapi import APIRouter, BackgroundTasks, Request, Response, status

from baghchal_server.accounts import lifecycle, service
from baghchal_server.accounts.models import User
from baghchal_server.accounts.schemas import (
    Accepted,
    ClaimIn,
    DeleteAccountIn,
    EmailChangeConfirmIn,
    EmailChangedOut,
    EmailChangeIn,
    ExportOut,
    GuestIn,
    LoginIn,
    MeOut,
    PasswordChangeIn,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
    RegisterIn,
    ResendVerificationIn,
    SessionOut,
    Transport,
    VerifyEmailIn,
)
from baghchal_server.accounts.service import GUEST, resolve_session
from baghchal_server.deps import (
    DB,
    AppState,
    CurrentUser,
    Member,
    State,
    client_ip,
    enforce_limit,
    session_token,
)
from baghchal_server.errors import AppError
from baghchal_server.legal import age, consents
from baghchal_server.lobby.routes import notify_challenge
from baghchal_server.mail import Mail, deliver
from baghchal_server.ratelimit import Limit

router = APIRouter(prefix="/api/v1")

# Per-IP limits allow for many people behind one address (a school, an office, a cafe, a
# mobile carrier). Guessing is held back by the per-account limits, the per-address mail limit
# and the cost of argon2id; the per-IP limits stop one address from doing too much of anything.
REGISTER_PER_IP: Final = Limit("register-ip", 60, 3600)
GUESTS_PER_IP: Final = Limit("guest-ip", 30, 3600)
MAIL_PER_ADDRESS: Final = Limit("mail-address", 3, 3600)
LOGIN_PER_IP: Final = Limit("login-ip", 300, 900)
# Only failed sign-ins count here, so a room full of people signing in is never held up.
LOGIN_FAILURES_PER_IP: Final = Limit("login-fail-ip", 50, 900)
LOGIN_PER_ACCOUNT_IP: Final = Limit("login-account-ip", 10, 900)
# Higher, so a stranger cannot lock a player out, yet distributed guessing is still capped.
LOGIN_PER_ACCOUNT: Final = Limit("login-account", 100, 900)
RESET_PER_IP: Final = Limit("reset-ip", 30, 3600)
TOKEN_PER_IP: Final = Limit("token-ip", 120, 3600)
# Changes that need the current password: also caps guessing it from a stolen session.
ACCOUNT_CHANGES_PER_USER: Final = Limit("account-change", 10, 3600)
EXPORTS_PER_USER: Final = Limit("export", 10, 3600)


def _send(tasks: BackgroundTasks, state: AppState, mail: Mail | None) -> None:
    # Mail goes out after the response, so response time does not depend on whether we sent it.
    if mail is not None:
        tasks.add_task(deliver, state.mailer, mail)


async def describe_me(db: DB, user: User, now: datetime) -> MeOut:
    return MeOut(
        id=user.id,
        username=user.username,
        email=user.email,
        created_at=user.created_at,
        role=user.role if user.role in {*service.STAFF, service.GUEST} else "player",
        plays_people=age.plays_people(user, now),
        parent_consent=user.parent_consent,
        age_needed=user.age_checked_at is None,
        consents_needed=await consents.needed(db, user.id),
    )


async def _session_response(  # noqa: PLR0913 - the session and how to hand it over
    response: Response,
    state: AppState,
    db: DB,
    user: User,
    token: str,
    *,
    transport: Transport,
) -> SessionOut:
    me = await describe_me(db, user, state.clock())
    if transport == "bearer":
        return SessionOut(user=me, token=token)
    s = state.settings
    response.set_cookie(
        s.session_cookie_name,
        token,
        max_age=int(s.session_ttl.total_seconds()),
        path="/",
        secure=s.is_production,
        httponly=True,
        samesite="lax",
    )
    return SessionOut(user=me)


@router.post("/auth/register", status_code=status.HTTP_202_ACCEPTED)
async def register(
    data: RegisterIn, request: Request, tasks: BackgroundTasks, state: State, db: DB
) -> Accepted:
    """Start sign-up. The account becomes usable once the emailed link is opened."""
    await enforce_limit(state, REGISTER_PER_IP, client_ip(request))
    await enforce_limit(state, MAIL_PER_ADDRESS, service.email_key(data.email))
    mail = await service.register(db, state.hasher, state.settings, state.clock(), data)
    _send(tasks, state, mail)
    return Accepted()


@router.post("/auth/guest")
async def play_as_guest(
    data: GuestIn, request: Request, response: Response, state: State, db: DB
) -> SessionOut:
    """Play at once, without signing up: a guest account, signed in. Guests play the computer
    and casual games; anything rated or social asks them to make an account (``/me/claim``),
    which keeps their games."""
    await enforce_limit(state, GUESTS_PER_IP, client_ip(request))
    user, token = await service.create_guest(db, state.hasher, state.settings, state.clock(), data)
    return await _session_response(response, state, db, user, token, transport=data.transport)


@router.post("/me/claim")
async def claim_guest(
    data: ClaimIn, user: CurrentUser, tasks: BackgroundTasks, state: State, db: DB
) -> MeOut:
    """Make my guest account a real one: the username and password work at once; the email
    address once the link sent to it is opened."""
    await enforce_limit(state, ACCOUNT_CHANGES_PER_USER, str(user.id))
    await enforce_limit(state, MAIL_PER_ADDRESS, service.email_key(data.email))
    mails = await service.claim_guest(db, state.hasher, state.settings, state.clock(), user, data)
    for mail in mails:
        _send(tasks, state, mail)
    return await describe_me(db, user, state.clock())


@router.post("/auth/verify-email")
async def verify_email(  # noqa: PLR0913, PLR0917 - a route's dependencies
    data: VerifyEmailIn,
    request: Request,
    response: Response,
    tasks: BackgroundTasks,
    state: State,
    db: DB,
) -> SessionOut:
    """Confirm the address and sign in. For a player under 18, this is when their parent is
    emailed to agree."""
    await enforce_limit(state, TOKEN_PER_IP, client_ip(request))
    user, token, mail = await service.verify_email(db, state.settings, state.clock(), data.token)
    _send(tasks, state, mail)
    return await _session_response(response, state, db, user, token, transport=data.transport)


@router.post("/auth/login")
async def login(
    data: LoginIn, request: Request, response: Response, state: State, db: DB
) -> SessionOut:
    ip, account = client_ip(request), data.login.strip().lower()
    # Count this attempt as a failure up front, so parallel guesses cannot all slip under the
    # limit, and take it back unless the password turns out to be wrong.
    counted_at = time.time()
    await enforce_limit(state, LOGIN_FAILURES_PER_IP, ip)
    try:
        await enforce_limit(state, LOGIN_PER_IP, ip)
        await enforce_limit(state, LOGIN_PER_ACCOUNT_IP, f"{account}|{ip}")
        await enforce_limit(state, LOGIN_PER_ACCOUNT, account)
        user, token = await service.login(db, state.hasher, state.settings, state.clock(), data)
    except AppError as error:
        if error.code != "invalid_credentials":
            await state.limiter.undo(LOGIN_FAILURES_PER_IP, ip, counted_at)
        raise
    await state.limiter.undo(LOGIN_FAILURES_PER_IP, ip, counted_at)
    return await _session_response(response, state, db, user, token, transport=data.transport)


def _clear_cookie(response: Response, state: AppState) -> None:
    response.delete_cookie(
        state.settings.session_cookie_name,
        path="/",
        secure=state.settings.is_production,
        httponly=True,
        samesite="lax",
    )


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, state: State, db: DB) -> None:
    """Sign out. A guest's account goes with it (nobody can sign in to it again), unless a
    live game holds it: housekeeping deletes it once its sessions have expired."""
    token, transport = session_token(request, state.settings)
    if token:
        user = await resolve_session(db, token, state.clock())
        await service.revoke_session(db, token)
        if user is not None and user.role == GUEST:
            # Guests make no challenges, so none close. A live game: housekeeping, later.
            with contextlib.suppress(AppError):
                await lifecycle.delete_account(db, state.settings, state.clock(), user)
    if transport == "cookie":
        _clear_cookie(response, state)


@router.post("/auth/verify-email/resend", status_code=status.HTTP_202_ACCEPTED)
async def resend_verification(
    data: ResendVerificationIn, request: Request, tasks: BackgroundTasks, state: State, db: DB
) -> Accepted:
    """Email a new confirmation link if the address has a sign-up waiting for one. Always
    answers the same, so it tells nobody whether an address is registered."""
    await enforce_limit(state, RESET_PER_IP, client_ip(request))
    await enforce_limit(state, MAIL_PER_ADDRESS, service.email_key(data.email))
    mail = await service.resend_verification(db, state.settings, state.clock(), data.email)
    _send(tasks, state, mail)
    return Accepted()


@router.post("/auth/password-reset", status_code=status.HTTP_202_ACCEPTED)
async def request_password_reset(
    data: PasswordResetRequestIn, request: Request, tasks: BackgroundTasks, state: State, db: DB
) -> Accepted:
    """Email a reset link if the address belongs to an account. Always answers the same."""
    await enforce_limit(state, RESET_PER_IP, client_ip(request))
    await enforce_limit(state, MAIL_PER_ADDRESS, service.email_key(data.email))
    mail = await service.request_password_reset(db, state.settings, state.clock(), data.email)
    _send(tasks, state, mail)
    return Accepted()


@router.post("/auth/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def confirm_password_reset(
    data: PasswordResetConfirmIn, request: Request, state: State, db: DB
) -> None:
    await enforce_limit(state, TOKEN_PER_IP, client_ip(request))
    await service.reset_password(db, state.hasher, state.clock(), data.token, data.password)


@router.get("/me")
async def me(user: CurrentUser, state: State, db: DB) -> MeOut:
    return await describe_me(db, user, state.clock())


# ── The signed-in player's account ────────────────────────────────────────


async def _confirm_password(state: AppState, user: User, password: str) -> None:
    await enforce_limit(state, ACCOUNT_CHANGES_PER_USER, str(user.id))
    await service.check_password(state.hasher, user, password)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(  # noqa: PLR0913, PLR0917 - FastAPI dependencies
    data: PasswordChangeIn,
    request: Request,
    user: CurrentUser,
    tasks: BackgroundTasks,
    state: State,
    db: DB,
) -> None:
    """Choose a new password. Other devices are signed out; this one stays signed in."""
    await _confirm_password(state, user, data.current_password)
    token, _ = session_token(request, state.settings)
    assert token is not None  # noqa: S101 - the request was authenticated with it
    mail = await service.change_password(
        db,
        state.hasher,
        state.settings,
        state.clock(),
        user,
        current_session=token,
        new_password=data.new_password,
    )
    _send(tasks, state, mail)


@router.post("/me/email", status_code=status.HTTP_202_ACCEPTED)
async def change_email(
    data: EmailChangeIn, user: Member, tasks: BackgroundTasks, state: State, db: DB
) -> Accepted:
    """Email a confirmation link to the new address; the address changes once it is opened."""
    await _confirm_password(state, user, data.password)
    await enforce_limit(state, MAIL_PER_ADDRESS, service.email_key(data.email))
    mail = await service.request_email_change(db, state.settings, state.clock(), user, data.email)
    _send(tasks, state, mail)
    return Accepted()


@router.post("/auth/confirm-email")
async def confirm_email_change(
    data: EmailChangeConfirmIn, request: Request, tasks: BackgroundTasks, state: State, db: DB
) -> EmailChangedOut:
    """Open the link sent to a new address. Works without signing in, on any device."""
    await enforce_limit(state, TOKEN_PER_IP, client_ip(request))
    user, notice = await service.confirm_email_change(db, state.settings, state.clock(), data.token)
    _send(tasks, state, notice)
    return EmailChangedOut(email=user.email)


@router.get("/me/export")
async def export_data(user: CurrentUser, response: Response, state: State, db: DB) -> ExportOut:
    """Everything the server keeps about you, as one JSON document."""
    await enforce_limit(state, EXPORTS_PER_USER, str(user.id))
    response.headers["content-disposition"] = (
        f'attachment; filename="baghchal-{user.username}.json"'
    )
    return await lifecycle.export(db, user, state.clock())


@router.post("/me/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(  # noqa: PLR0913, PLR0917 - FastAPI dependencies
    data: DeleteAccountIn,
    request: Request,
    response: Response,
    user: CurrentUser,
    tasks: BackgroundTasks,
    state: State,
    db: DB,
) -> None:
    """Delete your account for good. Every device is signed out."""
    await _confirm_password(state, user, data.password)
    closed, mail = await lifecycle.delete_account(db, state.settings, state.clock(), user)
    for challenge in closed:
        await notify_challenge(state, db, challenge)
    _send(tasks, state, mail)
    if session_token(request, state.settings)[1] == "cookie":
        _clear_cookie(response, state)
