"""private rooms: invitation links to a casual game

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-22 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
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


def downgrade() -> None:
    op.drop_table("rooms")
