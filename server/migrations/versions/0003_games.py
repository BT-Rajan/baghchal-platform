"""games

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-16 15:42:06.823906
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "games",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("challenge_id", sa.Uuid(), nullable=False),
        sa.Column("goat_id", sa.Uuid(), nullable=False),
        sa.Column("tiger_id", sa.Uuid(), nullable=False),
        sa.Column("rated", sa.Boolean(), nullable=False),
        sa.Column("initial_ms", sa.Integer(), nullable=False),
        sa.Column("increment_ms", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("winner", sa.String(length=8), nullable=True),
        sa.Column("end_reason", sa.String(length=16), nullable=True),
        sa.Column("ply", sa.Integer(), nullable=False),
        sa.Column("position", sa.String(length=40), nullable=False),
        sa.Column("goat_ms", sa.Integer(), nullable=False),
        sa.Column("tiger_ms", sa.Integer(), nullable=False),
        sa.Column("turn_started_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.Column("deadline_at", baghchal_server.db.UTCDateTime(), nullable=True),
        sa.Column("created_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.Column("finished_at", baghchal_server.db.UTCDateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["challenge_id"],
            ["challenges.id"],
            name=op.f("fk_games_challenge_id_challenges"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["goat_id"], ["users.id"], name=op.f("fk_games_goat_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["tiger_id"], ["users.id"], name=op.f("fk_games_tiger_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_games")),
        sa.UniqueConstraint("challenge_id", name=op.f("uq_games_challenge_id")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    with op.batch_alter_table("games", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_games_goat_id"), ["goat_id"], unique=False)
        batch_op.create_index(
            "ix_games_status_deadline_at", ["status", "deadline_at"], unique=False
        )
        batch_op.create_index(batch_op.f("ix_games_tiger_id"), ["tiger_id"], unique=False)

    op.create_table(
        "active_games",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("game_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["game_id"],
            ["games.id"],
            name=op.f("fk_active_games_game_id_games"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_active_games_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_active_games")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    with op.batch_alter_table("active_games", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_active_games_game_id"), ["game_id"], unique=False)

    op.create_table(
        "game_moves",
        sa.Column("game_id", sa.Uuid(), nullable=False),
        sa.Column("ply", sa.Integer(), nullable=False),
        sa.Column("notation", sa.String(length=8), nullable=False),
        sa.Column("played_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.Column("think_ms", sa.Integer(), nullable=False),
        sa.Column("clock_ms", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["game_id"], ["games.id"], name=op.f("fk_game_moves_game_id_games"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("game_id", "ply", name=op.f("pk_game_moves")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )


def downgrade() -> None:
    # Dropping a table drops its indexes (see 0001 for why not one by one on MySQL).
    op.drop_table("active_games")
    op.drop_table("game_moves")
    op.drop_table("games")
