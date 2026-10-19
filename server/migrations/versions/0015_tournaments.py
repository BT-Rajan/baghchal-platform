"""tournaments: small round robins among friends

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-23 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tournaments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("host_id", sa.Uuid(), nullable=False),
        sa.Column("time_control", sa.String(length=8), nullable=False),
        sa.Column("max_players", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("created_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.Column("started_at", baghchal_server.db.UTCDateTime(), nullable=True),
        sa.Column("finished_at", baghchal_server.db.UTCDateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["host_id"],
            ["users.id"],
            name=op.f("fk_tournaments_host_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tournaments")),
        sa.UniqueConstraint("code", name=op.f("uq_tournaments_code")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    op.create_table(
        "tournament_players",
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("joined_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_tournament_players_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_tournament_players_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("tournament_id", "user_id", name=op.f("pk_tournament_players")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    op.create_index("ix_tournament_players_user_id", "tournament_players", ["user_id"])
    op.create_table(
        "tournament_pairings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tournament_id", sa.Uuid(), nullable=False),
        sa.Column("goat_id", sa.Uuid(), nullable=False),
        sa.Column("tiger_id", sa.Uuid(), nullable=False),
        sa.Column("game_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["tournament_id"],
            ["tournaments.id"],
            name=op.f("fk_tournament_pairings_tournament_id_tournaments"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["goat_id"],
            ["users.id"],
            name=op.f("fk_tournament_pairings_goat_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tiger_id"],
            ["users.id"],
            name=op.f("fk_tournament_pairings_tiger_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["game_id"],
            ["games.id"],
            name=op.f("fk_tournament_pairings_game_id_games"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tournament_pairings")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    op.create_index(
        "ix_tournament_pairings_tournament_id", "tournament_pairings", ["tournament_id"]
    )


def downgrade() -> None:
    op.drop_table("tournament_pairings")
    op.drop_table("tournament_players")
    op.drop_table("tournaments")
