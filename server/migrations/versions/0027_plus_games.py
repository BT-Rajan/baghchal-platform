"""plus games: a Plus purchase lasts 45 games or a month, whichever comes first

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-20 15:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("grants", sa.Column("games_left", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("grants", "games_left")
