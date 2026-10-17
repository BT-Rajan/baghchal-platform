"""moderation: roles, suspensions, reports and the moderation log

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-17 14:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Plain ADD COLUMN, not a batch copy: on SQLite, copying ``users`` would drop the old
    # table, and with foreign keys on that deletes every game through cascades.
    op.add_column(
        "users",
        sa.Column("role", sa.String(length=16), server_default="player", nullable=False),
    )
    op.add_column(
        "users", sa.Column("suspended_until", baghchal_server.db.UTCDateTime(), nullable=True)
    )
    op.add_column("users", sa.Column("suspension_reason", sa.String(length=500), nullable=True))

    op.create_table(
        "reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("reporter_id", sa.Uuid(), nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=False),
        sa.Column("game_id", sa.Uuid(), nullable=True),
        sa.Column("reason", sa.String(length=16), nullable=False),
        sa.Column("details", sa.String(length=1000), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("open_key", sa.String(length=73), nullable=True),
        sa.Column("created_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.Column("resolved_at", baghchal_server.db.UTCDateTime(), nullable=True),
        sa.Column("resolved_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["game_id"], ["games.id"], name=op.f("fk_reports_game_id_games"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["reporter_id"],
            ["users.id"],
            name=op.f("fk_reports_reporter_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by"],
            ["users.id"],
            name=op.f("fk_reports_resolved_by_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["target_id"],
            ["users.id"],
            name=op.f("fk_reports_target_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reports")),
        sa.UniqueConstraint("open_key", name=op.f("uq_reports_open_key")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    op.create_index(op.f("ix_reports_reporter_id"), "reports", ["reporter_id"], unique=False)
    op.create_index("ix_reports_status_created_at", "reports", ["status", "created_at"])
    op.create_index("ix_reports_target_id_status", "reports", ["target_id", "status"])

    op.create_table(
        "moderation_actions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("moderator_id", sa.Uuid(), nullable=True),
        sa.Column("target_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(length=16), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("created_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["moderator_id"],
            ["users.id"],
            name=op.f("fk_moderation_actions_moderator_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["target_id"],
            ["users.id"],
            name=op.f("fk_moderation_actions_target_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_moderation_actions")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    op.create_index(
        "ix_moderation_actions_target_id_created_at",
        "moderation_actions",
        ["target_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_table("moderation_actions")
    op.drop_table("reports")
    op.drop_column("users", "suspension_reason")
    op.drop_column("users", "suspended_until")
    op.drop_column("users", "role")
