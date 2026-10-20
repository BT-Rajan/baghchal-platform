"""tournament forfeits: games won without playing, and players who left a running tournament

Revision ID: 0032
Revises: 0031
Create Date: 2026-10-21 09:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0032"
down_revision: str | None = "0031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tournament_players",
        sa.Column("withdrawn_at", baghchal_server.db.UTCDateTime(), nullable=True),
    )
    with op.batch_alter_table("tournament_pairings") as batch:
        batch.add_column(sa.Column("forfeit_to", sa.Uuid(), nullable=True))
        batch.create_foreign_key(
            "fk_tournament_pairings_forfeit_to", "users", ["forfeit_to"], ["id"], ondelete="CASCADE"
        )
    op.create_index("ix_tournament_pairings_game_id", "tournament_pairings", ["game_id"])


def downgrade() -> None:
    op.drop_index("ix_tournament_pairings_game_id", table_name="tournament_pairings")
    with op.batch_alter_table("tournament_pairings") as batch:
        batch.drop_constraint("fk_tournament_pairings_forfeit_to", type_="foreignkey")
        batch.drop_column("forfeit_to")
    op.drop_column("tournament_players", "withdrawn_at")
