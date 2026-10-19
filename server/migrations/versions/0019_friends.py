"""friends: requests and friendships

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-26 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "friendships",
        sa.Column("requester_id", sa.Uuid(), nullable=False),
        sa.Column("addressee_id", sa.Uuid(), nullable=False),
        sa.Column("pair_key", sa.String(length=73), nullable=False),
        sa.Column("created_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.Column("accepted_at", baghchal_server.db.UTCDateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["addressee_id"],
            ["users.id"],
            name=op.f("fk_friendships_addressee_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["requester_id"],
            ["users.id"],
            name=op.f("fk_friendships_requester_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("requester_id", "addressee_id", name=op.f("pk_friendships")),
        sa.UniqueConstraint("pair_key", name=op.f("uq_friendships_pair_key")),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
        mysql_engine="InnoDB",
    )
    op.create_index("ix_friendships_addressee_id", "friendships", ["addressee_id"])


def downgrade() -> None:
    op.drop_index("ix_friendships_addressee_id", table_name="friendships")
    op.drop_table("friendships")
