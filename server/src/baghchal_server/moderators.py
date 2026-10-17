"""Grant or take away the moderator role, from the server's command line.

    python -m baghchal_server.moderators grant USERNAME
    python -m baghchal_server.moderators revoke USERNAME
    python -m baghchal_server.moderators list

Roles are never granted through the API, so a stolen session cannot make itself a moderator.
Uses the same ``BAGHCHAL_*`` settings as the server.
"""

import asyncio
import sys

from sqlalchemy import select

from baghchal_server.accounts.models import User
from baghchal_server.accounts.service import MODERATOR, username_key
from baghchal_server.config import Settings
from baghchal_server.db import create_engine, session_factory

USAGE = "usage: python -m baghchal_server.moderators grant|revoke USERNAME | list"


async def run(settings: Settings, argv: list[str]) -> str:
    """Do what ``argv`` asks; returns what to print."""
    engine = create_engine(settings.database_url, pool_size=1)
    try:
        async with session_factory(engine)() as db:
            if argv == ["list"]:
                names = await db.scalars(
                    select(User.username).where(User.role == MODERATOR).order_by(User.username_key)
                )
                return "\n".join(names) or "No moderators."
            if len(argv) != 2 or argv[0] not in {"grant", "revoke"}:
                raise SystemExit(USAGE)
            command, name = argv
            user = await db.scalar(select(User).where(User.username_key == username_key(name)))
            if user is None or not user.is_active:
                raise SystemExit(f"No such player: {name}")
            user.role = MODERATOR if command == "grant" else "player"
            await db.commit()
            return f"{user.username} is now {'a moderator' if command == 'grant' else 'a player'}."
    finally:
        await engine.dispose()


def main(argv: list[str]) -> None:
    print(asyncio.run(run(Settings(), argv)))


if __name__ == "__main__":  # pragma: no cover
    main(sys.argv[1:])
