"""A second step for the admin pages that matter most (the payment keys): a code by email.

The admin asks for a code; it goes to their account's address and works for 10 minutes, on
the device (session) that asked. Entered, it lets that session use the page for 15 minutes.
Tries are limited, so the six digits cannot be guessed.
"""

import hmac
import secrets
from datetime import datetime, timedelta
from typing import Annotated, Final

from fastapi import Depends, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import EmailToken, Session, User
from baghchal_server.accounts.service import ADMIN
from baghchal_server.deps import DB, CurrentUser, State, session_token
from baghchal_server.errors import AppError
from baghchal_server.mail import Mail
from baghchal_server.security import hash_token

PURPOSE: Final = "admin_code"
CODE_LIFE: Final = timedelta(minutes=10)
CHECKED_FOR: Final = timedelta(minutes=15)


async def get_admin(user: CurrentUser) -> User:
    if user.role != ADMIN:
        raise AppError(403, "not_an_admin", "Only admins can do this.")
    return user


Admin = Annotated[User, Depends(get_admin)]


async def _session(request: Request, state: State, db: AsyncSession) -> Session:
    token, _ = session_token(request, state.settings)
    session = None if token is None else await db.get(Session, hash_token(token))
    assert session is not None  # noqa: S101 - the user was found through it
    return session


def _hash(session: Session, code: str) -> str:
    return hash_token(f"{session.token_hash}:{code}")


async def send_code(request: Request, state: State, db: AsyncSession, admin: User) -> Mail:
    now = state.clock()
    session = await _session(request, state, db)
    await db.execute(  # only the newest code works
        update(EmailToken)
        .where(
            EmailToken.user_id == admin.id,
            EmailToken.purpose == PURPOSE,
            EmailToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(
        EmailToken(
            token_hash=_hash(session, code),
            user_id=admin.id,
            purpose=PURPOSE,
            created_at=now,
            expires_at=now + CODE_LIFE,
        )
    )
    await db.commit()
    return Mail(
        admin.email,
        f"Your ClawPlay admin code: {code}",
        f"Hello {admin.username},\n\nYour code for the payments page is {code}. It works for "
        "10 minutes, on the device that asked for it.\n\nIf you did not ask for it, someone "
        "has your password: change it now.",
    )


async def check_code(
    request: Request, state: State, db: AsyncSession, admin: User, code: str
) -> datetime:
    """Let this session use the payments page for a while; until when."""
    now = state.clock()
    session = await _session(request, state, db)
    token = await db.scalar(
        select(EmailToken).where(
            EmailToken.purpose == PURPOSE,
            EmailToken.user_id == admin.id,
            EmailToken.used_at.is_(None),
            EmailToken.expires_at > now,
        )
    )
    if token is None or not hmac.compare_digest(token.token_hash, _hash(session, code)):
        raise AppError(400, "wrong_code", "That code is wrong or has expired. Ask for a new one.")
    token.used_at = now
    session.admin_checked_until = now + CHECKED_FOR
    await db.commit()
    return session.admin_checked_until


async def get_checked_admin(request: Request, admin: Admin, state: State, db: DB) -> User:
    session = await _session(request, state, db)
    until = session.admin_checked_until
    if until is None or until <= state.clock():
        raise AppError(
            403, "admin_code_needed", "Enter the code we email you to open the payments page."
        )
    return admin


CheckedAdmin = Annotated[User, Depends(get_checked_admin)]
"""An admin who entered an emailed code on this device within the last 15 minutes."""
