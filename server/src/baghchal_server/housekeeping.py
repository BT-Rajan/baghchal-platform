"""Deletes what the privacy policy says we no longer keep (legal/texts/privacy.md, "How long
we keep it"). Every server runs it about hourly; each step is an idempotent delete, so two
servers running it at once do no harm.
"""

import asyncio
import random
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Final

import structlog
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts import lifecycle
from baghchal_server.accounts.models import EmailToken, Session, User
from baghchal_server.chat.models import ChatMessage
from baghchal_server.chat.service import KEPT as CHAT
from baghchal_server.config import Settings
from baghchal_server.errors import AppError
from baghchal_server.fair_play.models import FairPlayCheck, FairPlaySide
from baghchal_server.legal.age import PENDING
from baghchal_server.legal.consents import PARENT_DEADLINE
from baghchal_server.moderation.models import ModerationAction, Report
from baghchal_server.payments.models import Payment

if TYPE_CHECKING:
    from baghchal_server.deps import AppState

log = structlog.get_logger(__name__)

INTERVAL_SECONDS: Final = 3600.0
UNCONFIRMED: Final = timedelta(days=7)
"""Sign-ups never confirmed."""
LINKS: Final = timedelta(days=7)
"""Email links, after they expire or are used."""
FAIR_PLAY: Final = timedelta(days=365)
MODERATION: Final = timedelta(days=3 * 365)
"""Reports after they were dealt with, and moderators' actions."""
PAYMENTS: Final = timedelta(days=8 * 365)
"""Indian accounting and tax law."""


async def _delete(db: AsyncSession, statement: object) -> int:
    result = await db.execute(statement)  # type: ignore[call-overload]
    return int(result.rowcount)


async def _without_parent(db: AsyncSession, settings: Settings, now: datetime) -> int:
    """Accounts of players under 18 whose parent did not agree in time: deleted like any
    account (anonymised), except while they are in a live game (next time)."""
    waiting = (
        await db.scalars(
            select(User).where(
                User.parent_consent == PENDING,
                User.is_active.is_(True),
                User.age_checked_at < now - PARENT_DEADLINE,
                User.adult_from > now,
            )
        )
    ).all()
    deleted = 0
    for user in waiting:
        try:
            await lifecycle.delete_account(db, settings, now, user)
        except AppError:  # a live game: next time
            continue
        deleted += 1
    return deleted


async def tidy(db: AsyncSession, settings: Settings, now: datetime) -> dict[str, int]:
    """Delete everything past its time; returns how many of each were deleted."""
    done = {
        "sessions": await _delete(db, delete(Session).where(Session.expires_at < now)),
        "email_links": await _delete(
            db,
            delete(EmailToken).where(
                (EmailToken.expires_at < now - LINKS) | (EmailToken.used_at < now - LINKS)
            ),
        ),
        "unconfirmed_sign_ups": await _delete(
            db,
            delete(User).where(
                User.email_verified_at.is_(None), User.created_at < now - UNCONFIRMED
            ),
        ),
        "fair_play_figures": await _delete(
            db, delete(FairPlaySide).where(FairPlaySide.created_at < now - FAIR_PLAY)
        ),
        "fair_play_checks": await _delete(
            db, delete(FairPlayCheck).where(FairPlayCheck.created_at < now - FAIR_PLAY)
        ),
        "reports": await _delete(db, delete(Report).where(Report.resolved_at < now - MODERATION)),
        "moderation_actions": await _delete(
            db, delete(ModerationAction).where(ModerationAction.created_at < now - MODERATION)
        ),
        "payments": await _delete(db, delete(Payment).where(Payment.created_at < now - PAYMENTS)),
        "chat_messages": await _delete(
            db, delete(ChatMessage).where(ChatMessage.created_at < now - CHAT)
        ),
    }
    await db.commit()
    done["accounts_without_parent"] = await _without_parent(db, settings, now)
    return done


async def run(state: "AppState") -> None:
    # Start at a random point in the hour, so servers started together do not run at once.
    await asyncio.sleep(random.uniform(0, INTERVAL_SECONDS))  # noqa: S311 - not security
    while True:
        try:
            async with state.sessions() as db:
                done = await tidy(db, state.settings, state.clock())
            for kind, count in done.items():
                state.metrics.housekeeping_deleted.labels(kind).inc(count)
            log.info("housekeeping.done", **done)
        except Exception:
            log.exception("housekeeping.failed")
        await asyncio.sleep(INTERVAL_SECONDS)
