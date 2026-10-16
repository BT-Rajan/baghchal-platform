"""challenges

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-16 13:14:11.271254
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "challenges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("challenger_id", sa.Uuid(), nullable=False),
        sa.Column("opponent_id", sa.Uuid(), nullable=False),
        sa.Column("pair_key", sa.String(length=73), nullable=True),
        sa.Column("initial_seconds", sa.Integer(), nullable=False),
        sa.Column("increment_seconds", sa.Integer(), nullable=False),
        sa.Column("rated", sa.Boolean(), nullable=False),
        sa.Column("challenger_side", sa.String(length=8), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.Column("expires_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.Column("responded_at", baghchal_server.db.UTCDateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["challenger_id"],
            ["users.id"],
            name=op.f("fk_challenges_challenger_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["opponent_id"],
            ["users.id"],
            name=op.f("fk_challenges_opponent_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_challenges")),
        sa.UniqueConstraint("pair_key", name=op.f("uq_challenges_pair_key")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    with op.batch_alter_table("challenges", schema=None) as batch_op:
        batch_op.create_index(
            "ix_challenges_challenger_id_status", ["challenger_id", "status"], unique=False
        )
        batch_op.create_index(
            "ix_challenges_opponent_id_status", ["opponent_id", "status"], unique=False
        )


def downgrade() -> None:
    # Dropping the table drops its indexes (see 0001 for why not one by one on MySQL).
    op.drop_table("challenges")
