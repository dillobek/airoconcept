from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth ----------
class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)
    totp_code: str | None = Field(default=None, max_length=8)


class UserOut(ORM):
    id: int
    email: str
    full_name: str
    role: str
    totp_enabled: bool


class TotpSetupOut(BaseModel):
    secret: str
    otpauth_url: str


class TotpEnableIn(BaseModel):
    code: str = Field(min_length=6, max_length=8)


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
