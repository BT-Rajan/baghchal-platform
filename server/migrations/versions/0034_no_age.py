"""no age checks: the month of birth, a parent's email and agreement are no longer kept

Players accept the terms, which say who may play; nothing about age is asked or stored.
The parents' links still waiting go too.

Revision ID: 0034
Revises: 0033
Create Date: 2026-10-21 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0034"
down_revision: str | None = "0033"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("DELETE FROM email_tokens WHERE purpose = 'parent'"))
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("parent_consented_at")
        batch_op.drop_column("parent_email")
        batch_op.drop_column("parent_consent")
        batch_op.drop_column("adult_from")
        batch_op.drop_column("age_checked_at")


def downgrade() -> None:
    # The answers are gone for good; the columns come back empty.
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("age_checked_at", baghchal_server.db.UTCDateTime()))
        batch_op.add_column(sa.Column("adult_from", baghchal_server.db.UTCDateTime()))
        batch_op.add_column(sa.Column("parent_consent", sa.String(length=8)))
        batch_op.add_column(sa.Column("parent_email", sa.String(length=254)))
        batch_op.add_column(sa.Column("parent_consented_at", baghchal_server.db.UTCDateTime()))
