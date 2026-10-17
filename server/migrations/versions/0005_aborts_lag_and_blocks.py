"""aborts, lag allowance and blocks

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-17 08:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("games", schema=None) as batch_op:
        # Existing games had no allowance; the default is removed again below.
        batch_op.add_column(sa.Column("lag_ms", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("aborted_by", sa.Uuid(), nullable=True))
        batch_op.create_index(
            "ix_games_aborted_by_finished_at", ["aborted_by", "finished_at"], unique=False
        )
        batch_op.create_foreign_key(
            batch_op.f("fk_games_aborted_by_users"),
            "users",
            ["aborted_by"],
            ["id"],
            ondelete="SET NULL",
        )
    with op.batch_alter_table("games", schema=None) as batch_op:
        batch_op.alter_column("lag_ms", existing_type=sa.Integer(), server_default=None)

    op.create_table(
        "blocks",
        sa.Column("blocker_id", sa.Uuid(), nullable=False),
        sa.Column("blocked_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["blocked_id"],
            ["users.id"],
            name=op.f("fk_blocks_blocked_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["blocker_id"],
            ["users.id"],
            name=op.f("fk_blocks_blocker_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("blocker_id", "blocked_id", name=op.f("pk_blocks")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    with op.batch_alter_table("blocks", schema=None) as batch_op:
        batch_op.create_index("ix_blocks_blocked_id", ["blocked_id"], unique=False)


def downgrade() -> None:
    op.drop_table("blocks")  # drops its index too (see 0001)
    with op.batch_alter_table("games", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("fk_games_aborted_by_users"), type_="foreignkey")
        batch_op.drop_index("ix_games_aborted_by_finished_at")
        batch_op.drop_column("aborted_by")
        batch_op.drop_column("lag_ms")
