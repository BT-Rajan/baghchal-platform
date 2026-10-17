"""account deletion and email changes

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-17 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("deleted_at", baghchal_server.db.UTCDateTime(), nullable=True))
    op.add_column("email_tokens", sa.Column("new_email", sa.String(length=254), nullable=True))


def downgrade() -> None:
    # Plain DROP COLUMN (SQLite 3.35+), not a batch copy: on SQLite, copying ``users`` would
    # drop the old table, and with foreign keys on that deletes every game through cascades.
    op.drop_column("email_tokens", "new_email")
    op.drop_column("users", "deleted_at")
