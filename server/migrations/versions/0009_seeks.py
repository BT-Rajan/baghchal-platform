"""quick pairing: seeks

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-17 15:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "seeks",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("initial_seconds", sa.Integer(), nullable=False),
        sa.Column("increment_seconds", sa.Integer(), nullable=False),
        sa.Column("rated", sa.Boolean(), nullable=False),
        sa.Column("created_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.Column("expires_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_seeks_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_seeks")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    op.create_index(
        "ix_seeks_kind",
        "seeks",
        ["initial_seconds", "increment_seconds", "rated", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("seeks")
