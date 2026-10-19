"""A parent's or guardian's decision about a player under 18, from the link we emailed."""

from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts import lifecycle
from baghchal_server.accounts.models import EmailToken, User
from baghchal_server.accounts.service import invalid_token
from baghchal_server.config import Settings
from baghchal_server.legal import age
from baghchal_server.legal.consents import PARENT
from baghchal_server.lobby.models import Challenge
from baghchal_server.mail import Mail
from baghchal_server.security import hash_token


async def _parent_token(db: AsyncSession, token: str, now: datetime) -> tuple[EmailToken, User]:
    found = await db.scalar(
        select(EmailToken).where(
            EmailToken.token_hash == hash_token(token),
            EmailToken.purpose == PARENT,
            EmailToken.used_at.is_(None),
            EmailToken.expires_at > now,
        )
    )
    user = None if found is None else await db.get(User, found.user_id)
    if found is None or user is None or not user.is_active or user.parent_consent is None:
        raise invalid_token()
    return found, user


async def look_up(db: AsyncSession, token: str, now: datetime) -> User:
    """The player a parent's link is about (the link stays usable)."""
    _, user = await _parent_token(db, token, now)
    return user


async def decide(
    db: AsyncSession,
    settings: Settings,
    now: datetime,
    token: str,
    *,
    agree: bool,
) -> tuple[User, list[Challenge], list[Mail]]:
    """Record a parent's decision. Agreeing lets the player play people and keeps the link
    working (to withdraw) until they turn 18; refusing, or withdrawing, deletes the account.
    Returns the player, any challenges closed, and the emails to send."""
    found, user = await _parent_token(db, token, now)
    if agree:
        if user.parent_consent == age.GIVEN:
            return user, [], []
        user.parent_consent = age.GIVEN
        user.parent_consented_at = now
        user.updated_at = now
        assert user.adult_from is not None  # noqa: S101 - only minors have a parent's link
        await db.execute(
            update(EmailToken)
            .where(EmailToken.token_hash == found.token_hash)
            .values(expires_at=user.adult_from)
        )
        await db.commit()
        mails = [
            Mail(
                _parent_email(user),
                "Thank you: your agreement is recorded",
                f"Hello,\n\nThank you. {user.username} can now play other people on ClawPlay."
                "\n\nYou can withdraw your agreement at any time, which deletes the account, "
                f"from the same link:\n\n{settings.public_base_url}/parent-consent?token={token}"
                "\n\nKeep this email to do so.",
            )
        ]
        return user, [], mails
    found.used_at = now
    challenges, goodbye = await lifecycle.delete_account(db, settings, now, user)
    return user, list(challenges), [goodbye]


def _parent_email(user: User) -> str:
    assert user.parent_email is not None  # noqa: S101 - a parent's link implies their address
    return user.parent_email
