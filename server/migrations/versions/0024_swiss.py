"""tournaments: Swiss rounds, and byes

Revision ID: 0024
Revises: 0023
Create Date: 2026-10-28 12:00:00.000000

Tournaments from before Swiss are one round (their round robin), so those under way finish
as they began.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("tournaments") as batch:
        batch.add_column(sa.Column("rounds", sa.Integer(), server_default="1", nullable=False))
        batch.add_column(sa.Column("round", sa.Integer(), server_default="1", nullable=False))
    with op.batch_alter_table("tournament_pairings") as batch:
        batch.add_column(sa.Column("round", sa.Integer(), server_default="1", nullable=False))
        batch.alter_column("tiger_id", existing_type=sa.Uuid(), nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM tournament_pairings WHERE tiger_id IS NULL")
    with op.batch_alter_table("tournament_pairings") as batch:
        batch.alter_column("tiger_id", existing_type=sa.Uuid(), nullable=False)
        batch.drop_column("round")
    with op.batch_alter_table("tournaments") as batch:
        batch.drop_column("round")
        batch.drop_column("rounds")
