"""legal: accepted versions of the terms and privacy policy; age and a parent's agreement

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-26 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "consents",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("document", sa.String(length=8), nullable=False),
        sa.Column("version", sa.String(length=16), nullable=False),
        sa.Column("accepted_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_consents_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", "document", "version", name=op.f("pk_consents")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    # Accounts made before these questions keep NULLs: the app asks them (age_checked_at).
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("age_checked_at", baghchal_server.db.UTCDateTime()))
        batch_op.add_column(sa.Column("adult_from", baghchal_server.db.UTCDateTime()))
        batch_op.add_column(sa.Column("parent_consent", sa.String(length=8)))
        batch_op.add_column(sa.Column("parent_email", sa.String(length=254)))
        batch_op.add_column(sa.Column("parent_consented_at", baghchal_server.db.UTCDateTime()))


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("parent_consented_at")
        batch_op.drop_column("parent_email")
        batch_op.drop_column("parent_consent")
        batch_op.drop_column("adult_from")
        batch_op.drop_column("age_checked_at")
    op.drop_table("consents")
