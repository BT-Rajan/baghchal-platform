"""A reminder before a player's plan time runs out: plans never renew by themselves.

Sent once, a few days before the last of their lined-up plan time ends (not when one purchase
hands over to the next), by the hourly housekeeping. Two servers running it at once send it
once: a reminder is claimed by marking the grant before the email goes.
"""

from datetime import datetime, timedelta
from typing import Final

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import User
from baghchal_server.billing.models import Grant
from baghchal_server.billing.plans import GAMES, NAMES, Plan
from baghchal_server.config import Settings
from baghchal_server.mail import Mail

AHEAD: Final = timedelta(days=3)


async def due(db: AsyncSession, settings: Settings, now: datetime) -> list[Mail]:
    """The reminders to send now (each grant is marked as reminded)."""
    ending = (
        await db.execute(
            select(Grant, User)
            .join(User, User.id == Grant.user_id)
            .where(
                Grant.plan.is_not(None),
                Grant.revoked_at.is_(None),
                Grant.reminded_at.is_(None),
                Grant.ends_at > now,
                Grant.ends_at <= now + AHEAD,
                User.is_active.is_(True),
            )
        )
    ).all()
    mails = []
    for grant, user in ending:
        later = await db.scalar(  # more plan time after it: remind when that ends instead
            select(Grant.id)
            .where(
                Grant.user_id == user.id,
                Grant.plan.is_not(None),
                Grant.revoked_at.is_(None),
                Grant.id != grant.id,
                or_(Grant.ends_at.is_(None), Grant.ends_at > grant.ends_at),
            )
            .limit(1)
        )
        if later is not None:
            continue
        claimed = await db.execute(
            update(Grant)
            .where(Grant.id == grant.id, Grant.reminded_at.is_(None))
            .values(reminded_at=now)
        )
        if claimed.rowcount != 1:  # type: ignore[attr-defined]
            continue  # another server sent it
        mails.append(_mail(settings, user, grant))
    await db.commit()
    return mails


def _mail(settings: Settings, user: User, grant: Grant) -> Mail:
    plan = Plan(grant.plan)  # type: ignore[arg-type]
    assert grant.ends_at is not None  # noqa: S101 - only grants that end are reminded
    games = GAMES[plan]
    sooner = (
        f" (or sooner, once its {games} games are played)"
        if games is not None and grant.games_left is not None
        else ""
    )
    return Mail(
        user.email,
        f"Your ClawPlay {NAMES[plan]} ends soon",
        f"Hello {user.username},\n\nYour ClawPlay {NAMES[plan]} ends on "
        f"{grant.ends_at.day} {grant.ends_at:%b %Y}{sooner}. Plans never renew by themselves, "
        "so nothing more will be charged. To keep it, buy again before then: the new time "
        "adds on to what you have.\n\n"
        f"Plans: {settings.public_base_url}/plans\n\n"
        "After that you are on the Free plan: your games, ratings and history stay.",
    )
