"""tournament challenges: "Play now" asks the opponent, who accepts like any challenge

Revision ID: 0035
Revises: 0034
Create Date: 2026-10-21 20:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0035"
down_revision: str | None = "0034"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("challenges") as batch:
        batch.add_column(sa.Column("pairing_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key(
            "fk_challenges_pairing_id",
            "tournament_pairings",
            ["pairing_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    with op.batch_alter_table("challenges") as batch:
        batch.drop_constraint("fk_challenges_pairing_id", type_="foreignkey")
        batch.drop_column("pairing_id")
