"""Google sign-in and taking moves back

Revision ID: 0036
Revises: 0035
Create Date: 2026-10-22 12:00:00.000000

users.google_subject: the Google account (its ``sub``) that signs in to this account.
games.takeback_offer: the side whose takeback request is open; goat_undos and tiger_undos:
how many moves each side has taken back (or asked to) in the game.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0036"
down_revision: str | None = "0035"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("google_subject", sa.String(255), nullable=True))
        batch.create_unique_constraint(op.f("uq_users_google_subject"), ["google_subject"])
    with op.batch_alter_table("games") as batch:
        batch.add_column(sa.Column("takeback_offer", sa.String(8), nullable=True))
        batch.add_column(sa.Column("goat_undos", sa.Integer(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("tiger_undos", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    with op.batch_alter_table("games") as batch:
        batch.drop_column("tiger_undos")
        batch.drop_column("goat_undos")
        batch.drop_column("takeback_offer")
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint(op.f("uq_users_google_subject"), type_="unique")
        batch.drop_column("google_subject")
