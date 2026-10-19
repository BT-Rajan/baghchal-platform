"""Consents to the terms and privacy policy, and the email asking a parent to agree.

Kept free of the accounts service, which uses it during sign-up.
"""

import uuid
from datetime import datetime, timedelta
from typing import Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import User
from baghchal_server.config import Settings
from baghchal_server.errors import AppError
from baghchal_server.legal.documents import VERSIONS, Document
from baghchal_server.legal.models import Consent
from baghchal_server.mail import Mail

PARENT: Final = "parent"
"""Email-token purpose: a parent's link to agree (or later withdraw)."""
PARENT_DEADLINE: Final = timedelta(days=7)
"""A parent has this long to agree; then the account is deleted (see housekeeping)."""


# ── Terms and privacy policy ──────────────────────────────────────────────


def check_versions(terms_version: str, privacy_version: str) -> None:
    """Refuse an acceptance of anything but the current versions (the player read an old
    text: the app fetches the new one and asks again)."""
    if (terms_version, privacy_version) != (VERSIONS[Document.TERMS], VERSIONS[Document.PRIVACY]):
        raise AppError(
            409,
            "legal_outdated",
            "The terms or the privacy policy have changed. Please read them again.",
        )


async def record(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> None:
    """Record that the player accepted the current versions of both documents."""
    for document, version in VERSIONS.items():
        await db.merge(
            Consent(user_id=user_id, document=document, version=version, accepted_at=now)
        )


async def needed(db: AsyncSession, user_id: uuid.UUID) -> list[Document]:
    """The documents whose current version the player has not accepted."""
    accepted = {
        (document, version)
        for document, version in (
            await db.execute(
                select(Consent.document, Consent.version).where(Consent.user_id == user_id)
            )
        ).all()
    }
    return [d for d, v in VERSIONS.items() if (d, v) not in accepted]


async def history(db: AsyncSession, user_id: uuid.UUID) -> list[Consent]:
    return list(
        (
            await db.scalars(
                select(Consent)
                .where(Consent.user_id == user_id)
                .order_by(Consent.accepted_at, Consent.document)
            )
        ).all()
    )


# ── Asking a parent ───────────────────────────────────────────────────────


def parent_mail(settings: Settings, user: User, token: str) -> Mail:
    """The email asking a parent or guardian to agree (the link also lets them withdraw)."""
    assert user.parent_email is not None  # noqa: S101 - only asked when one was given
    return Mail(
        user.parent_email,
        f"{user.username} would like to play ClawPlay",
        f"Hello,\n\n{user.username} has signed up to ClawPlay, an online game of Bagh Chal "
        "(tigers and goats), and gave this address as their parent's or guardian's. Players "
        "under 18 need a parent or guardian to agree before they play other people.\n\n"
        "Read what we do with their data and agree (or refuse) here, within 7 days:\n\n"
        f"{settings.public_base_url}/parent-consent?token={token}\n\n"
        "If you do nothing, the account and its data are deleted after 7 days. If you do not "
        "know who this is, ignore this email.\n\n"
        f"Privacy policy: {settings.public_base_url}/privacy",
    )
