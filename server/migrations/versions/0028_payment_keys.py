"""payment keys: Razorpay keys entered by an admin, behind a code by email

Revision ID: 0028
Revises: 0027
Create Date: 2026-10-20 18:00:00.000000

The keys move from the environment to the payments page (secrets encrypted with
``secrets_key``); an admin's session holds when its emailed code stops opening that page.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0028"
down_revision: str | None = "0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "payment_keys",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key_id", sa.String(64), nullable=False),
        sa.Column("key_secret", sa.String(512), nullable=False),
        sa.Column("webhook_secret", sa.String(512), nullable=False),
        sa.Column("updated_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
    )
    op.add_column(
        "sessions",
        sa.Column("admin_checked_until", baghchal_server.db.UTCDateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sessions", "admin_checked_until")
    op.drop_table("payment_keys")
