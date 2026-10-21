"""language: the app's language, with the other appearance settings

Revision ID: 0033
Revises: 0032
Create Date: 2026-10-21 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0033"
down_revision: str | None = "0032"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "appearances",
        sa.Column("language", sa.String(8), nullable=False, server_default="auto"),
    )


def downgrade() -> None:
    op.drop_column("appearances", "language")
