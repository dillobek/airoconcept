"""Moliya, buyurtma va qarzdorlik jadvallari.

Revision ID: 0003
Revises: 0002
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "uq_users_telegram_chat_id_not_null",
        "users",
        ["telegram_chat_id"],
        unique=True,
        postgresql_where=sa.text("telegram_chat_id IS NOT NULL"),
    )
    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id", ondelete="SET NULL"), nullable=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("customer_name", sa.String(255), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("status", sa.String(24), server_default="new", nullable=False),
        sa.Column("total_amount", sa.Numeric(16, 2), server_default="0", nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("total_amount >= 0", name="ck_orders_total_amount_nonnegative"),
        sa.CheckConstraint(
            "status IN ('new', 'in_progress', 'completed', 'cancelled')", name="ck_orders_valid_status"
        ),
    )
    op.create_index("ix_orders_lead_id", "orders", ["lead_id"])
    op.create_index("ix_orders_client_id", "orders", ["client_id"])
    op.create_index("ix_orders_status", "orders", ["status"])
    op.create_index("ix_orders_created_by_id", "orders", ["created_by_id"])
    op.create_index("ix_orders_status_created_at", "orders", ["status", "created_at"])

    op.create_table(
        "debts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("direction", sa.String(16), nullable=False),
        sa.Column("counterparty", sa.String(255), nullable=False),
        sa.Column("amount", sa.Numeric(16, 2), nullable=False),
        sa.Column("paid_amount", sa.Numeric(16, 2), server_default="0", nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(16), server_default="open", nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_debts_amount_positive"),
        sa.CheckConstraint("paid_amount >= 0 AND paid_amount <= amount", name="ck_debts_paid_amount_valid"),
        sa.CheckConstraint("direction IN ('receivable', 'payable')", name="ck_debts_valid_direction"),
        sa.CheckConstraint("status IN ('open', 'paid', 'cancelled')", name="ck_debts_valid_status"),
    )
    op.create_index("ix_debts_order_id", "debts", ["order_id"])
    op.create_index("ix_debts_direction", "debts", ["direction"])
    op.create_index("ix_debts_due_date", "debts", ["due_date"])
    op.create_index("ix_debts_status", "debts", ["status"])
    op.create_index("ix_debts_created_by_id", "debts", ["created_by_id"])
    op.create_index("ix_debts_status_due_date", "debts", ["status", "due_date"])

    op.create_table(
        "finance_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("amount", sa.Numeric(16, 2), nullable=False),
        sa.Column("category", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("payment_method", sa.String(32), server_default="cash", nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("debt_id", sa.Integer(), sa.ForeignKey("debts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(16), server_default="pending", nullable=False),
        sa.Column("source", sa.String(24), server_default="admin", nullable=False),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("approved_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_finance_entries_amount_positive"),
        sa.CheckConstraint("kind IN ('income', 'expense')", name="ck_finance_entries_valid_kind"),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')", name="ck_finance_entries_valid_status"
        ),
    )
    for column in (
        "kind",
        "category",
        "occurred_on",
        "order_id",
        "debt_id",
        "status",
        "created_by_id",
        "approved_by_id",
    ):
        op.create_index(f"ix_finance_entries_{column}", "finance_entries", [column])
    op.create_index(
        "ix_finance_entries_status_occurred_on", "finance_entries", ["status", "occurred_on"]
    )
    op.create_index(
        "ix_finance_entries_order_status", "finance_entries", ["order_id", "status"]
    )


def downgrade() -> None:
    op.drop_table("finance_entries")
    op.drop_table("debts")
    op.drop_table("orders")
    op.drop_index("uq_users_telegram_chat_id_not_null", table_name="users")
