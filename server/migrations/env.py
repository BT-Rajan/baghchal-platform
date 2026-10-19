"""Alembic environment.

The URL comes from ``BAGHCHAL_DATABASE_URL`` (same as the server). Tests pass an open
connection through ``config.attributes["connection"]`` instead.
"""

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy.engine import Connection

from baghchal_server.accounts import models  # noqa: F401  (registers tables)
from baghchal_server.appearance import models as appearance_models  # noqa: F401
from baghchal_server.billing import models as billing_models  # noqa: F401
from baghchal_server.db import Base, create_engine
from baghchal_server.fair_play import models as fair_play_models  # noqa: F401
from baghchal_server.friends import models as friends_models  # noqa: F401
from baghchal_server.games import models as game_models  # noqa: F401
from baghchal_server.legal import models as legal_models  # noqa: F401
from baghchal_server.lobby import models as lobby_models  # noqa: F401
from baghchal_server.moderation import models as moderation_models  # noqa: F401
from baghchal_server.notifications import models as notification_models  # noqa: F401
from baghchal_server.payments import models as payments_models  # noqa: F401
from baghchal_server.ratings import models as rating_models  # noqa: F401
from baghchal_server.tournaments import models as tournaments_models  # noqa: F401
from baghchal_server.trainer import models as trainer_models  # noqa: F401

config = context.config
if config.config_file_name and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _configure(connection: Connection) -> None:
    if connection.dialect.name == "sqlite":
        # On SQLite a batch ALTER copies the table and drops the old one; with foreign keys on,
        # dropping it would delete the rows that cascade from it (games with their challenge).
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()  # end the transaction the PRAGMA began; migrations run in their own
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,  # lets ALTERs work on SQLite too
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def _run_async() -> None:
    url = os.environ.get("BAGHCHAL_DATABASE_URL", "sqlite+aiosqlite:///./baghchal.db")
    engine = create_engine(url, pool_size=1)
    async with engine.connect() as conn:
        await conn.run_sync(_configure)
    await engine.dispose()


if context.is_offline_mode():
    raise SystemExit("Offline (SQL script) mode is not supported; run against a database.")

connection = config.attributes.get("connection")
if connection is not None:
    _configure(connection)
else:
    asyncio.run(_run_async())
