"""trainer: players' answers to the puzzles

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-24 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "trainer_attempts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("puzzle_id", sa.String(length=8), nullable=False),
        sa.Column("move", sa.String(length=16), nullable=False),
        sa.Column("correct", sa.Boolean(), nullable=False),
        sa.Column("created_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_trainer_attempts_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trainer_attempts")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    op.create_index(
        "ix_trainer_attempts_user_id_created_at", "trainer_attempts", ["user_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_table("trainer_attempts")
