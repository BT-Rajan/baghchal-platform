"""Account rules: registration, email verification, login, sessions, password reset, and
changing a password or email address.

Every function takes the clock as ``now`` so expiry is testable, and leaves committing to the
caller only where noted. Responses never reveal whether an email address is registered.
"""

import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Final

from sqlalchemy import ColumnElement, and_, delete, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.google import GoogleIdentity
from baghchal_server.accounts.models import EmailToken, Session, User
from baghchal_server.accounts.schemas import Agreement, ClaimIn, LoginIn, RegisterIn
from baghchal_server.config import Settings
from baghchal_server.errors import AppError
from baghchal_server.legal import consents as legal
from baghchal_server.mail import Mail
from baghchal_server.security import PasswordHasher, hash_token, new_token

VERIFY: Final = "verify"
RESET: Final = "reset"
EMAIL_CHANGE: Final = "email-change"
DELETED_PREFIX: Final = "deleted-"
"""Usernames of deleted accounts start with this, so nobody can register one."""
COMPUTER_PREFIX: Final = "computer"
"""The computer opponent's accounts are named computer-easy and so on."""
BOT_ROLE: Final = "bot"
GUEST: Final = "guest"
"""A visitor playing before signing up; until they claim the account it has no real email
or password."""
GUEST_PREFIX: Final = "guest-"
GUEST_DOMAIN: Final = "guest.invalid"
USERNAME_MIN: Final = 3
USERNAME_MAX: Final = 20
"""As ``schemas.Username`` allows."""
SESSION_TOUCH_INTERVAL: Final = timedelta(minutes=5)
RESERVED_USERNAMES: Final = frozenset(
    {"admin", "administrator", "anonymous", "api", "baghchal", "guest", "help", "mod",
     "moderator", "null", "root", "staff", "support", "system", "undefined", "www"}
)  # fmt: skip


PERMANENT: Final = datetime(9999, 12, 31, tzinfo=UTC)
"""A suspension that never ends: a ban."""
MODERATOR: Final = "moderator"
ADMIN: Final = "admin"
"""Moderates, and also grants plans and features (billing). Granted from the command line."""
STAFF: Final = frozenset({MODERATOR, ADMIN})


def username_key(username: str) -> str:
    return username.lower()


def username_allowed(settings: Settings, username: str) -> bool:
    """False for reserved names and names containing a blocked word."""
    key = username_key(username)
    if key in RESERVED_USERNAMES or key.startswith((DELETED_PREFIX, COMPUTER_PREFIX, GUEST_PREFIX)):
        return False
    letters = "".join(c for c in key if c.isalpha())  # "b_a-d1" hides "bad" too
    return not any(word.lower() in letters for word in settings.blocked_username_words)


def is_suspended(user: User, now: datetime) -> bool:
    return user.suspended_until is not None and user.suspended_until > now


def in_good_standing(now: datetime) -> ColumnElement[bool]:
    """Condition for an account that exists and is not suspended."""
    return and_(
        User.is_active.is_(True),
        or_(User.suspended_until.is_(None), User.suspended_until <= now),
    )


def suspension_error(user: User) -> AppError:
    until, reason = user.suspended_until, user.suspension_reason
    banned = until is None or until >= PERMANENT
    message = {
        (True, False): "This account has been banned.",
        (True, True): "This account has been banned. Reason: {reason}",
        (False, False): "This account is suspended until {until} UTC.",
        (False, True): "This account is suspended until {until} UTC. Reason: {reason}",
    }[banned, bool(reason)]
    return AppError(
        403,
        "account_suspended",
        message,
        until=f"{until:%d %B %Y, %H:%M}" if until is not None else "",
        reason=reason or "",
    )


def email_key(email: str) -> str:
    return email.strip().lower()


# ── Registration and verification ─────────────────────────────────────────


EMAIL_TAKEN: Final = "That email is already in use. Sign in instead."
USERNAME_TAKEN: Final = "That username is taken."


async def register(
    db: AsyncSession, hasher: PasswordHasher, settings: Settings, now: datetime, data: RegisterIn
) -> tuple[User, str, Mail]:
    """Make an account and sign it in at once; returns the user, a session token and the
    confirmation mail to send. Nothing waits for the address to be confirmed.

    An address or username already in use is refused (``email_taken``, ``username_taken``).
    Someone who signs up with an address that is not theirs gains nothing from it: its owner
    can reset the password, and signing in with Google for that address takes the account
    over (see ``google_sign_in``).
    """
    ukey, ekey = username_key(data.username), email_key(data.email)
    legal.check_versions(data.terms_version, data.privacy_version)
    if not username_allowed(settings, data.username):
        raise AppError(409, "username_unavailable", "That username is not available.")
    if data.password.lower() == ukey:
        raise AppError(422, "weak_password", "Your password must not be your username.")
    password_hash = await hasher.hash(data.password)
    if await db.scalar(select(User.id).where(User.username_key == ukey)):
        raise AppError(409, "username_taken", USERNAME_TAKEN)
    if await db.scalar(select(User.id).where(User.email_key == ekey)):
        raise AppError(409, "email_taken", EMAIL_TAKEN)
    user = User(
        id=uuid.uuid4(),
        username=data.username,
        username_key=ukey,
        email=data.email,
        email_key=ekey,
        password_hash=password_hash,
        is_active=True,
        role="player",
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        # Lost a race with a concurrent registration of the same name or address.
        await db.rollback()
        if await db.scalar(select(User.id).where(User.username_key == ukey)):
            raise AppError(409, "username_taken", USERNAME_TAKEN) from None
        raise AppError(409, "email_taken", EMAIL_TAKEN) from None
    await legal.record(db, user.id, now)
    token = await issue_token(db, user.id, VERIFY, now + settings.verify_email_ttl, now)
    session_token = await create_session(db, user.id, now, settings.session_ttl)
    await db.commit()
    return user, session_token, _verify_mail(settings, user, token)


async def verify_email(
    db: AsyncSession, settings: Settings, now: datetime, token: str
) -> tuple[User, str]:
    """Mark the address verified and sign the user in; returns the user and a session token."""
    user = await _active_user(db, await _consume_token(db, token, VERIFY, now))
    user.email_verified_at = user.email_verified_at or now
    user.updated_at = now
    session_token = await create_session(db, user.id, now, settings.session_ttl)
    await db.commit()
    return user, session_token


# ── Guests ────────────────────────────────────────────────────────────────


async def create_guest(
    db: AsyncSession, hasher: PasswordHasher, settings: Settings, now: datetime, data: Agreement
) -> tuple[User, str]:
    """A guest account and its session, to play at once without signing up.

    Its password is random and never told, so nobody can sign in to it; its email is a
    placeholder that no mail is sent to.
    """
    legal.check_versions(data.terms_version, data.privacy_version)
    password_hash = await hasher.hash(secrets.token_urlsafe(32))
    for _ in range(5):
        username = f"{GUEST_PREFIX}{secrets.token_hex(3)}"
        user = User(
            id=uuid.uuid4(),
            username=username,
            username_key=username,
            email=f"{username}@{GUEST_DOMAIN}",
            email_key=f"{username}@{GUEST_DOMAIN}",
            password_hash=password_hash,
            email_verified_at=now,
            is_active=True,
            role=GUEST,
            created_at=now,
            updated_at=now,
        )
        db.add(user)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            continue
        await legal.record(db, user.id, now)
        token = await create_session(db, user.id, now, settings.session_ttl)
        await db.commit()
        return user, token
    raise AppError(503, "try_again", "Please try again.")


async def claim_guest(  # noqa: PLR0913, PLR0917 - who, and the account they want
    db: AsyncSession,
    hasher: PasswordHasher,
    settings: Settings,
    now: datetime,
    user: User,
    data: ClaimIn,
) -> Mail | None:
    """Turn a guest into an account, keeping its games: the username and password work at
    once; the email address once its confirmation link is opened (as for a change of email,
    so nobody can take an address they cannot read)."""
    if user.role != GUEST:
        raise AppError(409, "not_a_guest", "You already have an account.")
    legal.check_versions(data.terms_version, data.privacy_version)
    ukey = username_key(data.username)
    if not username_allowed(settings, data.username):
        raise AppError(409, "username_unavailable", "That username is not available.")
    if data.password.lower() == ukey:
        raise AppError(422, "weak_password", "Your password must not be your username.")
    password_hash = await hasher.hash(data.password)
    user.username, user.username_key = data.username, ukey
    user.password_hash, user.role, user.updated_at = password_hash, "player", now
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise AppError(409, "username_taken", "That username is taken.") from None
    await legal.record(db, user.id, now)
    return await request_email_change(db, settings, now, user, data.email)


# ── Login and sessions ────────────────────────────────────────────────────


async def login(
    db: AsyncSession,
    hasher: PasswordHasher,
    settings: Settings,
    now: datetime,
    credentials: LoginIn,
) -> tuple[User, str]:
    password = credentials.password
    key = credentials.login.strip().lower()
    column = User.email_key if "@" in key else User.username_key
    user = await db.scalar(select(User).where(column == key))
    password_ok = await hasher.verify(user.password_hash if user else None, password)
    if user is None or not password_ok:
        raise AppError(401, "invalid_credentials", "Wrong username, email or password.")
    _check_can_sign_in(user, now)
    if hasher.needs_rehash(user.password_hash):
        user.password_hash = await hasher.hash(password)
        user.updated_at = now
    session_token = await create_session(db, user.id, now, settings.session_ttl)
    await db.commit()
    return user, session_token


def _check_can_sign_in(user: User, now: datetime) -> None:
    if not user.is_active:
        raise AppError(403, "account_disabled", "This account has been disabled.")
    if is_suspended(user, now):
        raise suspension_error(user)


# ── Google ────────────────────────────────────────────────────────────────


def _username_from_email(email: str) -> str:
    """A username from the part of the address before the ``@``, as the rules allow."""
    name = re.sub(r"[^A-Za-z0-9_-]", "", email.split("@", 1)[0])
    name = name.lstrip("_-")[:USERNAME_MAX]
    return name if len(name) >= USERNAME_MIN else f"player{name}"[:USERNAME_MAX]


async def _free_username(db: AsyncSession, settings: Settings, email: str) -> str:
    base = _username_from_email(email)
    if not username_allowed(settings, base):
        base = "player"
    candidates = [base] + [
        f"{base[: USERNAME_MAX - 5]}{secrets.randbelow(10_000):04d}" for _ in range(8)
    ]
    for name in candidates:
        if not await db.scalar(select(User.id).where(User.username_key == username_key(name))):
            return name
    raise AppError(503, "try_again", "Please try again.")


async def google_sign_in(  # noqa: PLR0913 - who Google says it is, and what they agreed to
    db: AsyncSession,
    hasher: PasswordHasher,
    settings: Settings,
    now: datetime,
    google: GoogleIdentity,
    agreement: Agreement,
) -> tuple[User, str]:
    """Sign in the account a Google account belongs to; returns the user and a session token.

    The first time, the account with the same address is linked to it (Google has verified the
    address), or a new account is made: its username comes from the address, its password is
    random and never told (a password can be chosen later with "Forgot password"). An account
    whose address was never confirmed is taken over: whoever signed it up may not own the
    address, so its password and sessions stop working.
    """
    created = False
    user = await db.scalar(select(User).where(User.google_subject == google.subject))
    if user is not None:
        _check_can_sign_in(user, now)
    else:
        user = await db.scalar(select(User).where(User.email_key == email_key(google.email)))
        if user is not None:
            _check_can_sign_in(user, now)
            if user.google_subject is not None or user.role in {GUEST, BOT_ROLE}:
                raise AppError(409, "email_taken", EMAIL_TAKEN)
            user.google_subject = google.subject
            if user.email_verified_at is None:
                user.password_hash = await hasher.hash(secrets.token_urlsafe(32))
                user.email_verified_at = now
                await db.execute(delete(Session).where(Session.user_id == user.id))
                await _cancel_tokens(db, user.id, RESET, now)
            user.updated_at = now
        else:
            legal.check_versions(agreement.terms_version, agreement.privacy_version)
            name = await _free_username(db, settings, google.email)
            created = True
            user = User(
                id=uuid.uuid4(),
                username=name,
                username_key=username_key(name),
                email=google.email,
                email_key=email_key(google.email),
                google_subject=google.subject,
                password_hash=await hasher.hash(secrets.token_urlsafe(32)),
                email_verified_at=now,
                is_active=True,
                role="player",
                created_at=now,
                updated_at=now,
            )
            db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        # Lost a race: the same Google account, address or name was taken a moment ago.
        await db.rollback()
        raise AppError(409, "try_again", "Please try again.") from None
    if created:
        await legal.record(db, user.id, now)
    session_token = await create_session(db, user.id, now, settings.session_ttl)
    await db.commit()
    return user, session_token


async def create_session(
    db: AsyncSession, user_id: uuid.UUID, now: datetime, ttl: timedelta
) -> str:
    """Add a session (caller commits) and return its token."""
    token, token_hash = new_token()
    db.add(
        Session(
            token_hash=token_hash,
            user_id=user_id,
            created_at=now,
            expires_at=now + ttl,
            last_used_at=now,
        )
    )
    return token


async def resolve_session(db: AsyncSession, token: str, now: datetime) -> User | None:
    """The active user owning an unexpired session, or None."""
    if len(token) > 64:
        return None
    row = (
        await db.execute(
            select(Session, User)
            .join(User, User.id == Session.user_id)
            .where(
                Session.token_hash == hash_token(token),
                Session.expires_at > now,
                in_good_standing(now),
            )
        )
    ).first()
    if row is None:
        return None
    session, user = row
    if now - session.last_used_at > SESSION_TOUCH_INTERVAL:  # avoid a write on every request
        session.last_used_at = now
        await db.commit()
    return user


async def revoke_session(db: AsyncSession, token: str) -> None:
    await db.execute(delete(Session).where(Session.token_hash == hash_token(token)))
    await db.commit()


# ── Password reset ────────────────────────────────────────────────────────


async def resend_verification(
    db: AsyncSession, settings: Settings, now: datetime, email: str
) -> Mail | None:
    """A fresh confirmation link for a sign-up not yet confirmed, or None (nothing to send).
    The earlier links keep working until they expire."""
    user = await db.scalar(select(User).where(User.email_key == email_key(email)))
    if user is None or not user.is_active or user.email_verified_at is not None:
        return None
    token = await issue_token(db, user.id, VERIFY, now + settings.verify_email_ttl, now)
    await db.commit()
    return _verify_mail(settings, user, token)


async def request_password_reset(
    db: AsyncSession, settings: Settings, now: datetime, email: str
) -> Mail | None:
    """Return the reset mail to send, or None when there is no eligible account. Any account
    with a real address may reset, confirmed or not (opening the link confirms it)."""
    user = await db.scalar(select(User).where(User.email_key == email_key(email)))
    if user is None or not user.is_active or user.role in {GUEST, BOT_ROLE}:
        return None
    token = await issue_token(db, user.id, RESET, now + settings.password_reset_ttl, now)
    await db.commit()
    return Mail(
        user.email,
        "Reset your ClawPlay password",
        f"Hello {user.username},\n\nTo choose a new password, open this link within "
        f"{_hours(settings.password_reset_ttl)}:\n\n"
        f"{settings.public_base_url}/reset-password?token={token}\n\n"
        "If you did not ask for this, ignore this email; your password has not changed.",
    )


async def reset_password(
    db: AsyncSession, hasher: PasswordHasher, now: datetime, token: str, password: str
) -> None:
    """Set a new password and sign the user out everywhere."""
    user = await _active_user(db, await _consume_token(db, token, RESET, now))
    if password.lower() == user.username_key:
        await db.rollback()
        raise AppError(422, "weak_password", "Your password must not be your username.")
    user.password_hash = await hasher.hash(password)
    user.updated_at = now
    user.email_verified_at = user.email_verified_at or now  # they just proved they read this inbox
    await db.execute(delete(Session).where(Session.user_id == user.id))
    await db.commit()


# ── Changes while signed in ───────────────────────────────────────────────


async def check_password(hasher: PasswordHasher, user: User, password: str) -> None:
    """Make sure the signed-in player typed their password, before a sensitive change."""
    if not await hasher.verify(user.password_hash, password):
        raise AppError(403, "wrong_password", "That is not your current password.")


async def change_password(  # noqa: PLR0913 - who, which session stays, and the new password
    db: AsyncSession,
    hasher: PasswordHasher,
    settings: Settings,
    now: datetime,
    user: User,
    *,
    current_session: str,
    new_password: str,
) -> Mail:
    """Set a new password and sign out every other device; returns the notice to send."""
    if new_password.lower() == user.username_key:
        raise AppError(422, "weak_password", "Your password must not be your username.")
    user.password_hash = await hasher.hash(new_password)
    user.updated_at = now
    await db.execute(
        delete(Session).where(
            Session.user_id == user.id, Session.token_hash != hash_token(current_session)
        )
    )
    await _cancel_tokens(db, user.id, RESET, now)
    await db.commit()
    return Mail(
        user.email,
        "Your ClawPlay password was changed",
        f"Hello {user.username},\n\nThe password of your account was just changed, and any "
        "other devices were signed out.\n\nIf you did not do this, reset your password now at "
        f"{settings.public_base_url}/forgot-password.",
    )


async def request_email_change(
    db: AsyncSession, settings: Settings, now: datetime, user: User, new_email: str
) -> Mail | None:
    """Send a confirmation link to the new address (None: send nothing).

    The address only changes once the link is opened, so a typo cannot lock anyone out. If the
    address already belongs to someone, its owner is told instead, and the answer is the same.
    """
    key = email_key(new_email)
    if key == user.email_key:
        raise AppError(422, "same_email", "That is already your email address.")
    owner = await db.scalar(select(User).where(User.email_key == key))
    if owner is not None:
        await db.commit()
        return _account_exists_mail(settings, owner)
    token = await issue_token(
        db, user.id, EMAIL_CHANGE, now + settings.verify_email_ttl, now, new_email=new_email
    )
    await db.commit()
    return Mail(
        new_email,
        "Confirm your new ClawPlay email address",
        f"Hello {user.username},\n\nTo use this address for your ClawPlay account, open this "
        f"link within {_hours(settings.verify_email_ttl)}:\n\n"
        f"{settings.public_base_url}/confirm-email?token={token}\n\n"
        "If you did not ask for this, ignore this email; nothing will change.",
    )


async def confirm_email_change(
    db: AsyncSession, settings: Settings, now: datetime, token: str
) -> tuple[User, Mail]:
    """Switch to the confirmed address; returns the user and a notice for the old address."""
    token_hash = hash_token(token)
    user = await _active_user(db, await _consume_token(db, token, EMAIL_CHANGE, now))
    new_email = await db.scalar(
        select(EmailToken.new_email).where(EmailToken.token_hash == token_hash)
    )
    assert new_email is not None  # noqa: S101 - every email-change token has one
    key = email_key(new_email)
    if await db.scalar(select(User.id).where(User.email_key == key, User.id != user.id)):
        await db.rollback()
        raise AppError(409, "email_taken", "That email address now belongs to another account.")
    old_email = user.email
    user.email, user.email_key = new_email, key
    user.email_verified_at = now
    user.updated_at = now
    # Reset links already sent to the old address must not work any more.
    await _cancel_tokens(db, user.id, RESET, now)
    await db.commit()
    return user, Mail(
        old_email,
        "Your ClawPlay email address was changed",
        f"Hello {user.username},\n\nYour account now uses {new_email}; emails will no longer "
        "come to this address.\n\nIf you did not do this, reply to this email so we can help "
        "you get your account back.",
    )


# ── Helpers ───────────────────────────────────────────────────────────────


async def _cancel_tokens(db: AsyncSession, user_id: uuid.UUID, purpose: str, now: datetime) -> None:
    await db.execute(
        update(EmailToken)
        .where(
            EmailToken.user_id == user_id,
            EmailToken.purpose == purpose,
            EmailToken.used_at.is_(None),
        )
        .values(used_at=now)
    )


async def issue_token(  # noqa: PLR0913 - what the token is for, and until when
    db: AsyncSession,
    user_id: uuid.UUID,
    purpose: str,
    expires_at: datetime,
    now: datetime,
    *,
    new_email: str | None = None,
) -> str:
    """Create a token, cancelling any earlier unused token for the same purpose."""
    await _cancel_tokens(db, user_id, purpose, now)
    token, token_hash = new_token()
    db.add(
        EmailToken(
            token_hash=token_hash,
            user_id=user_id,
            purpose=purpose,
            new_email=new_email,
            created_at=now,
            expires_at=expires_at,
        )
    )
    return token


async def _consume_token(db: AsyncSession, token: str, purpose: str, now: datetime) -> uuid.UUID:
    """Mark a token used and return its user. A single atomic UPDATE, so it works only once."""
    token_hash = hash_token(token)
    result = await db.execute(
        update(EmailToken)
        .where(
            EmailToken.token_hash == token_hash,
            EmailToken.purpose == purpose,
            EmailToken.used_at.is_(None),
            EmailToken.expires_at > now,
        )
        .values(used_at=now)
    )
    if result.rowcount != 1:  # type: ignore[attr-defined]
        await db.rollback()
        raise invalid_token()
    user_id = await db.scalar(select(EmailToken.user_id).where(EmailToken.token_hash == token_hash))
    assert user_id is not None  # noqa: S101 - the row was just updated
    return user_id


async def _active_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        await db.rollback()
        raise invalid_token()
    return user


def invalid_token() -> AppError:
    return AppError(400, "invalid_token", "This link is invalid or has expired.")


def _hours(ttl: timedelta) -> str:
    hours = round(ttl.total_seconds() / 3600)
    return "1 hour" if hours == 1 else f"{hours} hours"


def _verify_mail(settings: Settings, user: User, token: str) -> Mail:
    return Mail(
        user.email,
        "Confirm your ClawPlay account",
        f"Welcome, {user.username}!\n\nYou can play already. To confirm this is your email "
        f"address, open this link within {_hours(settings.verify_email_ttl)}:\n\n"
        f"{settings.public_base_url}/verify-email?token={token}\n\n"
        "If you did not sign up, ignore this email.",
    )


def _account_exists_mail(settings: Settings, user: User) -> Mail:
    return Mail(
        user.email,
        "You already have a ClawPlay account",
        f"Someone tried to sign up with this email address, but it already belongs to the "
        f"account {user.username}.\n\nIf that was you, sign in at {settings.public_base_url}. "
        f"Forgot your password? Reset it at {settings.public_base_url}/forgot-password.\n\n"
        "If it was not you, you can ignore this email.",
    )
