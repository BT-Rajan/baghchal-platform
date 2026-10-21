"""Consents to the terms and privacy policy.

Kept free of the accounts service, which uses it during sign-up.
"""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.errors import AppError
from baghchal_server.legal.documents import VERSIONS, Document
from baghchal_server.legal.models import Consent

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
