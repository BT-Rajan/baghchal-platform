"""plans: grants of plans and features by admins

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-19 09:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "grants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("plan", sa.String(length=16), nullable=True),
        sa.Column("feature", sa.String(length=32), nullable=True),
        sa.Column("starts_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.Column("ends_at", baghchal_server.db.UTCDateTime(), nullable=True),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("granted_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.Column("revoked_at", baghchal_server.db.UTCDateTime(), nullable=True),
        sa.Column("revoked_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_grants_user_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["granted_by"],
            ["users.id"],
            name=op.f("fk_grants_granted_by_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["revoked_by"],
            ["users.id"],
            name=op.f("fk_grants_revoked_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_grants")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    op.create_index("ix_grants_user_id_created_at", "grants", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_table("grants")
