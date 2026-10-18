"""games against the computer

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-17 15:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Plain ADD COLUMN (see ADR 0004): no table copy on SQLite.
    op.add_column("games", sa.Column("bot_level", sa.String(length=8), nullable=True))


def downgrade() -> None:
    op.drop_column("games", "bot_level")
