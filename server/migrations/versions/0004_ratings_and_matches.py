"""ratings and matches

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-16 17:09:31.959196
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ratings",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("category", sa.String(length=8), nullable=False),
        sa.Column("rating", sa.Float(), nullable=False),
        sa.Column("deviation", sa.Float(), nullable=False),
        sa.Column("volatility", sa.Float(), nullable=False),
        sa.Column("games", sa.Integer(), nullable=False),
        sa.Column("updated_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_ratings_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "category", name=op.f("pk_ratings")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    with op.batch_alter_table("ratings", schema=None) as batch_op:
        batch_op.create_index("ix_ratings_category_rating", ["category", "rating"], unique=False)

    op.create_table(
        "matches",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("challenge_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.Column("finished_at", baghchal_server.db.UTCDateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["challenge_id"],
            ["challenges.id"],
            name=op.f("fk_matches_challenge_id_challenges"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_matches")),
        sa.UniqueConstraint("challenge_id", name=op.f("uq_matches_challenge_id")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    with op.batch_alter_table("games", schema=None) as batch_op:
        batch_op.add_column(sa.Column("match_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("match_game", sa.Integer(), nullable=True))
        # Existing games get the default rating; the default is removed again below.
        batch_op.add_column(
            sa.Column("goat_rating", sa.Integer(), nullable=False, server_default="1500")
        )
        batch_op.add_column(
            sa.Column("tiger_rating", sa.Integer(), nullable=False, server_default="1500")
        )
        batch_op.add_column(sa.Column("goat_rating_change", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("tiger_rating_change", sa.Integer(), nullable=True))
        batch_op.alter_column("challenge_id", existing_type=sa.Uuid(), nullable=True)
        batch_op.create_index(batch_op.f("ix_games_match_id"), ["match_id"], unique=False)
        batch_op.create_foreign_key(
            batch_op.f("fk_games_match_id_matches"),
            "matches",
            ["match_id"],
            ["id"],
            ondelete="CASCADE",
        )
    with op.batch_alter_table("games", schema=None) as batch_op:
        batch_op.alter_column("goat_rating", existing_type=sa.Integer(), server_default=None)
        batch_op.alter_column("tiger_rating", existing_type=sa.Integer(), server_default=None)


def downgrade() -> None:
    # Second games of matches have no challenge and cannot survive the NOT NULL below.
    op.execute("DELETE FROM games WHERE challenge_id IS NULL")
    with op.batch_alter_table("games", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("fk_games_match_id_matches"), type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_games_match_id"))
        batch_op.alter_column("challenge_id", existing_type=sa.Uuid(), nullable=False)
        for column in (
            "tiger_rating_change",
            "goat_rating_change",
            "tiger_rating",
            "goat_rating",
            "match_game",
            "match_id",
        ):
            batch_op.drop_column(column)
    op.drop_table("matches")
    op.drop_table("ratings")  # drops its indexes too (see 0001)
