"""games: draw offers

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-20 12:00:00.000000

A game can now end in a draw that both players agree (end_reason "draw_agreed", no winner).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0025"
down_revision: str | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("games") as batch:
        batch.add_column(sa.Column("draw_offer", sa.String(8), nullable=True))
        batch.add_column(sa.Column("goat_offer_ply", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("tiger_offer_ply", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("games") as batch:
        batch.drop_column("tiger_offer_ply")
        batch.drop_column("goat_offer_ply")
        batch.drop_column("draw_offer")
