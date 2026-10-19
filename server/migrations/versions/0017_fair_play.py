"""fair play: the queue of rated games to check, each player's figures, automatic reports

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-25 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "fair_play_checks",
        sa.Column("game_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=8), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("claimed_at", baghchal_server.db.UTCDateTime(), nullable=True),
        sa.Column("checked_at", baghchal_server.db.UTCDateTime(), nullable=True),
        sa.Column("created_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["game_id"],
            ["games.id"],
            name=op.f("fk_fair_play_checks_game_id_games"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("game_id", name=op.f("pk_fair_play_checks")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    op.create_index(
        "ix_fair_play_checks_status_created_at", "fair_play_checks", ["status", "created_at"]
    )
    op.create_table(
        "fair_play_sides",
        sa.Column("game_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("stage", sa.String(length=8), nullable=False),
        sa.Column("side", sa.String(length=8), nullable=False),
        sa.Column("moves", sa.Integer(), nullable=False),
        sa.Column("decisive", sa.Integer(), nullable=False),
        sa.Column("agreed", sa.Integer(), nullable=False),
        sa.Column("decisive_loss", sa.Integer(), nullable=False),
        sa.Column("mistakes", sa.Integer(), nullable=False),
        sa.Column("blunders", sa.Integer(), nullable=False),
        sa.Column("think_median_ms", sa.Integer(), nullable=False),
        sa.Column("think_spread", sa.Float(), nullable=False),
        sa.Column("fast_moves", sa.Integer(), nullable=False),
        sa.Column("created_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["game_id"],
            ["games.id"],
            name=op.f("fk_fair_play_sides_game_id_games"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_fair_play_sides_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("game_id", "user_id", "stage", name=op.f("pk_fair_play_sides")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    op.create_index(
        "ix_fair_play_sides_user_id_stage_created_at",
        "fair_play_sides",
        ["user_id", "stage", "created_at"],
    )
    # Automatic reports have no reporter.
    with op.batch_alter_table("reports", schema=None) as batch_op:
        batch_op.alter_column("reporter_id", existing_type=sa.Uuid(), nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM reports WHERE reporter_id IS NULL")
    with op.batch_alter_table("reports", schema=None) as batch_op:
        batch_op.alter_column("reporter_id", existing_type=sa.Uuid(), nullable=False)
    op.drop_table("fair_play_sides")
    op.drop_table("fair_play_checks")
