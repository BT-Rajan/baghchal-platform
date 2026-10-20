"""plan reminders: when a player was told their plan ends soon

Revision ID: 0030
Revises: 0029
Create Date: 2026-10-20 21:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0030"
down_revision: str | None = "0029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "grants", sa.Column("reminded_at", baghchal_server.db.UTCDateTime(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("grants", "reminded_at")
