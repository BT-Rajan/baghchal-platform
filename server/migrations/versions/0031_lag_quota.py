"""lag quota: each side's network delay allowance for a whole game

Revision ID: 0031
Revises: 0030
Create Date: 2026-10-20 23:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0031"
down_revision: str | None = "0030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for side in ("goat", "tiger"):
        op.add_column(
            "games",
            sa.Column(f"{side}_lag_left_ms", sa.Integer(), nullable=False, server_default="10000"),
        )


def downgrade() -> None:
    for side in ("goat", "tiger"):
        op.drop_column("games", f"{side}_lag_left_ms")
