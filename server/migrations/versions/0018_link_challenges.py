"""challenges by link replace private rooms

A challenge may name no opponent and carry a link code instead; whoever accepts it first
becomes the opponent. Private rooms, which did the same job for Pro hosts only, are removed,
with the private_rooms feature and any grants of it.

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-26 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("challenges") as batch:
        batch.alter_column("opponent_id", existing_type=sa.Uuid(), nullable=True)
        batch.add_column(sa.Column("code", sa.String(length=16), nullable=True))
        batch.create_unique_constraint(op.f("uq_challenges_code"), ["code"])
    op.drop_table("rooms")
    op.execute("DELETE FROM grants WHERE feature = 'private_rooms'")


def downgrade() -> None:
    op.create_table(
        "rooms",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("host_id", sa.Uuid(), nullable=False),
        sa.Column("time_control", sa.String(length=8), nullable=False),
        sa.Column("host_side", sa.String(length=8), nullable=False),
        sa.Column("status", sa.String(length=8), nullable=False),
        sa.Column("game_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.Column("expires_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["host_id"], ["users.id"], name=op.f("fk_rooms_host_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["game_id"], ["games.id"], name=op.f("fk_rooms_game_id_games"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_rooms")),
        sa.UniqueConstraint("code", name=op.f("uq_rooms_code")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    op.create_index("ix_rooms_host_id_status", "rooms", ["host_id", "status"])
    op.execute("DELETE FROM challenges WHERE opponent_id IS NULL")
    with op.batch_alter_table("challenges") as batch:
        batch.drop_constraint(op.f("uq_challenges_code"), type_="unique")
        batch.drop_column("code")
        batch.alter_column("opponent_id", existing_type=sa.Uuid(), nullable=False)
