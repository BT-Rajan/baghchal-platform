"""refunds: money given back on a payment ends the plan time it bought

Revision ID: 0029
Revises: 0028
Create Date: 2026-10-20 20:00:00.000000

Razorpay's refund.processed and payment.dispute.lost webhooks find the payment by its pay_… id.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import baghchal_server.db

revision: str = "0029"
down_revision: str | None = "0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "payment_refunds",
        sa.Column("refund_id", sa.String(64), nullable=False),
        sa.Column("payment_id", sa.Uuid(), nullable=False),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("created_at", baghchal_server.db.UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("refund_id"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_bin",
    )
    op.create_index("ix_payment_refunds_payment_id", "payment_refunds", ["payment_id"])
    op.create_index("ix_payments_payment_id", "payments", ["payment_id"])


def downgrade() -> None:
    op.drop_index("ix_payments_payment_id", table_name="payments")
    op.drop_index("ix_payment_refunds_payment_id", table_name="payment_refunds")
    op.drop_table("payment_refunds")
