"""Grant or take away the moderator and admin roles, from the server's command line.

    python -m baghchal_server.moderators grant USERNAME    # moderator
    python -m baghchal_server.moderators admin USERNAME    # admin: moderates, and grants plans
    python -m baghchal_server.moderators revoke USERNAME   # back to player
    python -m baghchal_server.moderators list

Roles are never granted through the API, so a stolen session cannot make itself a moderator.
Uses the same ``BAGHCHAL_*`` settings as the server.
"""

import asyncio
import sys

from sqlalchemy import select

from baghchal_server.accounts.models import User
from baghchal_server.accounts.service import ADMIN, MODERATOR, STAFF, username_key
from baghchal_server.config import Settings
from baghchal_server.db import create_engine, session_factory

USAGE = "usage: python -m baghchal_server.moderators grant|admin|revoke USERNAME | list"
ROLES = {"grant": MODERATOR, "admin": ADMIN, "revoke": "player"}
NAMED = {MODERATOR: "a moderator", ADMIN: "an admin", "player": "a player"}


async def run(settings: Settings, argv: list[str]) -> str:
    """Do what ``argv`` asks; returns what to print."""
    engine = create_engine(settings.database_url, pool_size=1)
    try:
        async with session_factory(engine)() as db:
            if argv == ["list"]:
                staff = await db.execute(
                    select(User.username, User.role)
                    .where(User.role.in_(STAFF))
                    .order_by(User.username_key)
                )
                lines = [name if role == MODERATOR else f"{name} ({role})" for name, role in staff]
                return "\n".join(lines) or "No moderators."
            if len(argv) != 2 or argv[0] not in ROLES:
                raise SystemExit(USAGE)
            command, name = argv
            user = await db.scalar(select(User).where(User.username_key == username_key(name)))
            if user is None or not user.is_active:
                raise SystemExit(f"No such player: {name}")
            user.role = ROLES[command]
            await db.commit()
            return f"{user.username} is now {NAMED[user.role]}."
    finally:
        await engine.dispose()


def main(argv: list[str]) -> None:
    print(asyncio.run(run(Settings(), argv)))


if __name__ == "__main__":  # pragma: no cover
    main(sys.argv[1:])
