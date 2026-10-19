"""Age rules: at least 13 to play; under 18, a parent or guardian must agree before playing
other people (India's DPDP Act counts anyone under 18 as a child).

We ask for the month and year of birth only, and count the youngest age they could mean: a
player born in May 2010 is surely 18 on 1 June 2028. Nobody is let in early, and only the
date the player is surely an adult is kept.
"""

import re
from datetime import UTC, datetime
from typing import Annotated, Final

from pydantic import StringConstraints

from baghchal_server.accounts.models import User
from baghchal_server.errors import AppError

MIN_AGE: Final = 13
ADULT_AGE: Final = 18
OLDEST: Final = 120
PENDING: Final = "pending"
GIVEN: Final = "given"

BirthMonth = Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", strict=True)]
"""``YYYY-MM``."""
_MONTH = re.compile(r"^(\d{4})-(\d{2})$")


def surely(birth_month: str, age: int) -> datetime:
    """When someone born in that month is surely ``age``: the first day of the next month,
    ``age`` years on."""
    match = _MONTH.match(birth_month)
    if match is None:
        raise ValueError(f"not a YYYY-MM month: {birth_month!r}")
    year, month = int(match.group(1)), int(match.group(2))
    if month == 12:
        year, month = year + 1, 1
    else:
        month += 1
    return datetime(year + age, month, 1, tzinfo=UTC)


def adult_from(birth_month: str, now: datetime) -> datetime | None:
    """When the player is surely 18, or None if they surely are now. Refuses anyone who may
    be under 13, or whose month is in the future or impossibly long ago."""
    if surely(birth_month, 0) > now or surely(birth_month, OLDEST) < now:
        raise AppError(422, "invalid_birth_month", "Please check your month of birth.")
    if surely(birth_month, MIN_AGE) > now:
        raise AppError(403, "too_young", f"You must be at least {MIN_AGE} to play on ClawPlay.")
    adult = surely(birth_month, ADULT_AGE)
    return adult if adult > now else None


def check(
    birth_month: str,
    parent_email: str | None,
    own_email: str,
    now: datetime,
    *,
    guest: bool = False,
) -> datetime | None:
    """Check a sign-up's age answers; returns when the player is surely 18 (None: they are).
    Players under 18 must give a parent's email, unless they are guests (who play only the
    computer until they make an account)."""
    adult = adult_from(birth_month, now)
    if adult is not None and not guest:
        if parent_email is None:
            raise AppError(
                422,
                "parent_email_required",
                "Players under 18 need a parent or guardian to agree: please give their email.",
            )
        if parent_email.strip().lower() == own_email.strip().lower():
            raise AppError(
                422,
                "parent_email_is_yours",
                "Please give your parent's or guardian's email address, not yours.",
            )
    return adult


def apply(user: User, adult: datetime | None, parent_email: str | None, now: datetime) -> bool:
    """Record a checked age on the account; returns whether a parent must now be emailed."""
    user.age_checked_at = now
    user.adult_from = adult
    if adult is None:
        user.parent_consent = None
        user.parent_email = None
        return False
    if user.parent_consent == GIVEN:
        return False
    user.parent_consent = PENDING
    user.parent_email = parent_email
    return parent_email is not None


def plays_people(user: User, now: datetime) -> bool:
    """Whether the player may play other people: not while a parent's agreement is pending."""
    return user.parent_consent != PENDING or (
        user.adult_from is not None and user.adult_from <= now
    )
