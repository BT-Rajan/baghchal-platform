"""The Razorpay keys: entered by an admin on the payments page, kept encrypted in the database.

They live here only (not in the environment), so an admin can set, change or remove them
without a restart. The secrets are encrypted with ``secrets_key`` and never sent back: the page
shows only the key id and when, and by whom, they were set.
"""

import base64
import hashlib
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

import structlog
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from baghchal_server.accounts.models import User
from baghchal_server.accounts.service import ADMIN
from baghchal_server.config import Settings
from baghchal_server.errors import AppError
from baghchal_server.mail import Mail
from baghchal_server.payments.gateway import Gateway, RazorpayGateway
from baghchal_server.payments.models import PaymentKeys
from baghchal_server.payments.schemas import PaymentKeysIn, PaymentKeysOut

log = structlog.get_logger()

ROW = 1


@dataclass(frozen=True)
class Keys:
    key_id: str
    key_secret: str
    webhook_secret: str


def _box(settings: Settings) -> Fernet | None:
    raw = settings.secrets_key.get_secret_value()
    if not raw:
        return None
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(raw.encode()).digest()))


async def load(db: AsyncSession, settings: Settings) -> Keys | None:
    """The keys, or None: payments are off."""
    row = await db.get(PaymentKeys, ROW)
    box = _box(settings)
    if row is None or box is None:
        return None
    try:
        return Keys(
            row.key_id,
            box.decrypt(row.key_secret).decode(),
            box.decrypt(row.webhook_secret).decode(),
        )
    except InvalidToken:
        log.error("payments.keys_unreadable")  # secrets_key changed: enter the keys again
        return None


async def describe(db: AsyncSession, settings: Settings) -> PaymentKeysOut:
    row = await db.get(PaymentKeys, ROW)
    by = None if row is None or row.updated_by is None else await db.get(User, row.updated_by)
    return PaymentKeysOut(
        on=await load(db, settings) is not None,
        key_id=None if row is None else row.key_id,
        updated_at=None if row is None else row.updated_at,
        updated_by=None if by is None else by.username,
        can_store=_box(settings) is not None,
        webhook_url=f"{settings.public_base_url}/api/v1/payments/webhook",
    )


async def _told(db: AsyncSession, admin: User, what: str) -> list[Mail]:
    """Every admin hears of a change to the keys, so a stolen session cannot change them
    unnoticed."""
    admins = await db.scalars(select(User).where(User.role == ADMIN, User.is_active.is_(True)))
    return [
        Mail(
            a.email,
            "ClawPlay payment keys changed",
            f"Hello {a.username},\n\n{admin.username} {what}.\n\n"
            "If nobody on your team did this, remove the keys on the payments page, change "
            "the admin's password and roll the keys in the Razorpay Dashboard.",
        )
        for a in admins
    ]


async def save(
    db: AsyncSession, settings: Settings, admin: User, now: datetime, data: PaymentKeysIn
) -> list[Mail]:
    box = _box(settings)
    if box is None:
        raise AppError(
            409,
            "secrets_key_missing",
            "Set BAGHCHAL_SECRETS_KEY on the server first: it encrypts the keys.",
        )
    row = await db.get(PaymentKeys, ROW) or PaymentKeys(id=ROW)
    row.key_id = data.key_id
    row.key_secret = box.encrypt(data.key_secret.get_secret_value().encode()).decode()
    row.webhook_secret = box.encrypt(data.webhook_secret.get_secret_value().encode()).decode()
    row.updated_at, row.updated_by = now, admin.id
    db.add(row)
    await db.commit()
    live = "live" if data.key_id.startswith("rzp_live_") else "test"
    return await _told(db, admin, f"set the Razorpay {live} keys ({data.key_id})")


async def remove(db: AsyncSession, admin: User) -> list[Mail]:
    await db.execute(delete(PaymentKeys))
    await db.commit()
    return await _told(db, admin, "removed the Razorpay keys: payments are off")


MakeGateway = Callable[[str, str], Gateway]


class Gateways:
    """A gateway for the current keys, made when they are first used after a change."""

    def __init__(self, make: MakeGateway = RazorpayGateway) -> None:
        self._make = make
        self._made: dict[tuple[str, str], Gateway] = {}

    def get(self, keys: Keys) -> Gateway:
        found = self._made.get((keys.key_id, keys.key_secret))
        if found is None:  # older ones stay open until shutdown: a request may be using one
            found = self._made[keys.key_id, keys.key_secret] = self._make(
                keys.key_id, keys.key_secret
            )
        return found

    async def close(self) -> None:
        for gateway in self._made.values():
            await gateway.close()
        self._made.clear()
