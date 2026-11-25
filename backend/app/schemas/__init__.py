from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth ----------
class LoginIn(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=1, max_length=200)
    totp_code: str | None = Field(default=None, max_length=8)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()


class UserOut(ORM):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    totp_enabled: bool


class TotpSetupOut(BaseModel):
    secret: str
    otpauth_url: str


class TotpEnableIn(BaseModel):
    code: str = Field(min_length=6, max_length=8)


class CredentialsUpdateIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    new_password: str | None = Field(default=None, min_length=12, max_length=200)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()


# ---------- CRM ----------
class ClientOut(ORM):
    id: int
    name: str | None
    phone: str | None
    district: str | None
    source: str | None
    created_at: datetime


class LeadOut(ORM):
    id: int
    client_id: int
    channel: str
    status: str
    temperature: str
    furniture_type: str | None
    dimensions: str | None
    budget: str | None
    deadline: str | None
    pain_points: str | None
    measurement_at: str | None
    measurement_address: str | None
    created_at: datetime
    updated_at: datetime
    client: ClientOut


class LeadPage(BaseModel):
    items: list[LeadOut]
    total: int


class LeadUpdateIn(BaseModel):
    status: str | None = None
    temperature: str | None = None
    furniture_type: str | None = None
    dimensions: str | None = None
    budget: str | None = None
    deadline: str | None = None
    measurement_at: str | None = None
    measurement_address: str | None = None


class WebsiteLeadIn(BaseModel):
    """Saytdagi forma orqali kelgan murojaat."""

    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=9, max_length=20)
    furniture_type: str | None = Field(default=None, max_length=60)
    message: str | None = Field(default=None, max_length=1000)


class MessageOut(ORM):
    id: int
    role: str
    text: str
    created_at: datetime


class ConversationOut(ORM):
    id: int
    channel: str
    status: str
    off_topic_count: int
    last_message_at: datetime
    messages: list[MessageOut]


class ConversationStatusIn(BaseModel):
    status: str = Field(pattern="^(active|handoff|closed)$")


# ---------- Agent ----------
class AgentMessageIn(BaseModel):
    channel: str = Field(pattern="^(telegram|website)$")
    external_user_id: str = Field(min_length=1, max_length=128)
    text: str = Field(min_length=1, max_length=4000)
    name: str | None = Field(default=None, max_length=255)
    username: str | None = Field(default=None, max_length=128)


class AgentMessageOut(BaseModel):
    reply: str | None


# ---------- API kalitlar ----------
ALLOWED_SCOPES = {
    "agent:chat",
    "leads:read",
    "leads:write",
    "clients:read",
    "clients:write",
    "conversations:read",
    "finance:read",
    "finance:write",
    "orders:read",
    "orders:write",
    "tasks:read",
    "tasks:write",
}


class ApiKeyCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    scopes: list[str]
    allowed_ips: list[str] = []
    expires_at: datetime | None = None


class ApiKeyOut(ORM):
    id: int
    name: str
    prefix: str
    scopes: list[str]
    allowed_ips: list[str]
    expires_at: datetime | None
    revoked: bool
    last_used_at: datetime | None
    created_at: datetime


class ApiKeyCreatedOut(ApiKeyOut):
    key: str = Field(description="To'liq kalit. Faqat bir marta ko'rsatiladi — darhol saqlang.")


# ---------- Foydalanuvchilar va rollar ----------
class UserAdminOut(UserOut):
    is_active: bool
    telegram_chat_id: str | None
    created_at: datetime


class UserCreateIn(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    email: str = Field(min_length=3, max_length=255)
    full_name: str = Field(min_length=2, max_length=255)
    role: str = Field(pattern="^(owner|manager|accountant|worker)$")
    password: str = Field(min_length=12, max_length=200)
    telegram_chat_id: str | None = Field(default=None, max_length=32)

    @field_validator("username")
    @classmethod
    def normalize_new_username(cls, value: str) -> str:
        return value.strip().lower()


class UserUpdateIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    role: str | None = Field(default=None, pattern="^(owner|manager|accountant|worker)$")
    is_active: bool | None = None
    telegram_chat_id: str | None = Field(default=None, max_length=32)
    new_password: str | None = Field(default=None, min_length=12, max_length=200)


# ---------- Moliya va buyurtmalar ----------
class OrderCreateIn(BaseModel):
    lead_id: int | None = Field(default=None, gt=0)
    customer_name: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=255)
    total_amount: Decimal = Field(ge=0, max_digits=16, decimal_places=2)
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=4000)


class OrderUpdateIn(BaseModel):
    customer_name: str | None = Field(default=None, min_length=1, max_length=255)
    title: str | None = Field(default=None, min_length=1, max_length=255)
    status: str | None = Field(default=None, pattern="^(new|in_progress|completed|cancelled)$")
    total_amount: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=4000)


class OrderOut(ORM):
    id: int
    lead_id: int | None
    client_id: int | None
    customer_name: str
    title: str
    status: str
    total_amount: Decimal
    due_date: date | None
    notes: str | None
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    income_total: Decimal = Decimal("0")
    expense_total: Decimal = Decimal("0")
    outstanding: Decimal = Decimal("0")
    profit: Decimal = Decimal("0")


class DebtCreateIn(BaseModel):
    order_id: int | None = Field(default=None, gt=0)
    direction: str = Field(pattern="^(receivable|payable)$")
    counterparty: str = Field(min_length=1, max_length=255)
    amount: Decimal = Field(gt=0, max_digits=16, decimal_places=2)
    due_date: date | None = None
    description: str | None = Field(default=None, max_length=4000)


class DebtOut(ORM):
    id: int
    order_id: int | None
    direction: str
    counterparty: str
    amount: Decimal
    paid_amount: Decimal
    due_date: date | None
    status: str
    description: str | None
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    remaining_amount: Decimal = Decimal("0")


class FinanceEntryCreateIn(BaseModel):
    kind: str = Field(pattern="^(income|expense)$")
    amount: Decimal = Field(gt=0, max_digits=16, decimal_places=2)
    category: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=4000)
    occurred_on: date = Field(default_factory=date.today)
    payment_method: str = Field(default="cash", pattern="^(cash|card|transfer|other)$")
    order_id: int | None = Field(default=None, gt=0)
    debt_id: int | None = Field(default=None, gt=0)


class FinanceEntryOut(ORM):
    id: int
    kind: str
    amount: Decimal
    category: str
    description: str | None
    occurred_on: date
    payment_method: str
    order_id: int | None
    debt_id: int | None
    status: str
    source: str
    created_by_id: int
    approved_by_id: int | None
    approved_at: datetime | None
    rejection_reason: str | None
    created_at: datetime


class ApprovalDecisionIn(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class FinanceDashboardOut(BaseModel):
    period: str
    period_start: date
    period_end: date
    income: Decimal
    expense: Decimal
    profit: Decimal
    receivable: Decimal
    payable: Decimal
    pending_approvals: int
    active_orders: int


class ReportPoint(BaseModel):
    label: str
    income: Decimal
    expense: Decimal
    profit: Decimal


class FinanceReportOut(BaseModel):
    period: str
    period_start: date
    period_end: date
    income: Decimal
    expense: Decimal
    profit: Decimal
    points: list[ReportPoint]


# ---------- Telegram xodimlar moliyasi ----------
class TelegramStaffOut(BaseModel):
    full_name: str
    role: str


class TelegramFinanceEntryIn(FinanceEntryCreateIn):
    telegram_chat_id: str = Field(min_length=1, max_length=32)


class TelegramDebtIn(DebtCreateIn):
    telegram_chat_id: str = Field(min_length=1, max_length=32)


class TelegramApprovalIn(BaseModel):
    telegram_chat_id: str = Field(min_length=1, max_length=32)


class TelegramDebtPaymentIn(BaseModel):
    telegram_chat_id: str = Field(min_length=1, max_length=32)
    amount: Decimal = Field(gt=0, max_digits=16, decimal_places=2)
    description: str | None = Field(default=None, max_length=4000)
    payment_method: str = Field(default="cash", pattern="^(cash|card|transfer|other)$")


class TelegramReportIn(BaseModel):
    telegram_chat_id: str = Field(min_length=1, max_length=32)
    period: str = Field(default="day", pattern="^(day|week|month)$")
