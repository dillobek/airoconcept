from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class OrderStatus(StrEnum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class EntryKind(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"


class ApprovalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class DebtDirection(StrEnum):
    RECEIVABLE = "receivable"
    PAYABLE = "payable"


class DebtStatus(StrEnum):
    OPEN = "open"
    PAID = "paid"
    CANCELLED = "cancelled"


class Order(Base, TimestampMixin):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint("total_amount >= 0", name="total_amount_nonnegative"),
        CheckConstraint(
            "status IN ('new', 'in_progress', 'completed', 'cancelled')",
            name="valid_status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lead_id: Mapped[int | None] = mapped_column(ForeignKey("leads.id", ondelete="SET NULL"), index=True, nullable=True)
    client_id: Mapped[int | None] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"), index=True, nullable=True
    )
    customer_name: Mapped[str] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(24), default=OrderStatus.NEW, index=True)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(16, 2), default=Decimal("0"))
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)


class Debt(Base, TimestampMixin):
    __tablename__ = "debts"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("paid_amount >= 0 AND paid_amount <= amount", name="paid_amount_valid"),
        CheckConstraint("direction IN ('receivable', 'payable')", name="valid_direction"),
        CheckConstraint("status IN ('open', 'paid', 'cancelled')", name="valid_status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), index=True, nullable=True
    )
    direction: Mapped[str] = mapped_column(String(16), index=True)
    counterparty: Mapped[str] = mapped_column(String(255))
    amount: Mapped[Decimal] = mapped_column(Numeric(16, 2))
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(16, 2), default=Decimal("0"))
    due_date: Mapped[date | None] = mapped_column(Date, index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default=DebtStatus.OPEN, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)


class FinanceEntry(Base, TimestampMixin):
    __tablename__ = "finance_entries"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("kind IN ('income', 'expense')", name="valid_kind"),
        CheckConstraint("status IN ('pending', 'approved', 'rejected')", name="valid_status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(16, 2))
    category: Mapped[str] = mapped_column(String(120), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_on: Mapped[date] = mapped_column(Date, index=True)
    payment_method: Mapped[str] = mapped_column(String(32), default="cash")
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), index=True, nullable=True
    )
    debt_id: Mapped[int | None] = mapped_column(
        ForeignKey("debts.id", ondelete="SET NULL"), index=True, nullable=True
    )
    status: Mapped[str] = mapped_column(String(16), default=ApprovalStatus.PENDING, index=True)
    source: Mapped[str] = mapped_column(String(24), default="admin")
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
