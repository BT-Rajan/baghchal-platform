"""themes, sound packs and badges: each player's appearance choices

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-20 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "appearances",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("board", sa.String(length=16), nullable=False),
        sa.Column("pieces", sa.String(length=16), nullable=False),
        sa.Column("sounds", sa.String(length=16), nullable=False),
        sa.Column("show_badge", sa.Boolean(), nullable=False),
        sa.Column("updated_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_appearances_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_appearances")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )


def downgrade() -> None:
    op.drop_table("appearances")
