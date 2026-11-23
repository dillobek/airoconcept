from datetime import datetime
from enum import StrEnum

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, utcnow


class Channel(StrEnum):
    TELEGRAM = "telegram"
    INSTAGRAM = "instagram"
    MESSENGER = "messenger"
    WEBSITE = "website"
    PHONE = "phone"


class LeadStatus(StrEnum):
    NEW = "new"  # yangi murojaat
    QUALIFIED = "qualified"  # ehtiyoj aniqlandi
    MEASUREMENT_BOOKED = "measurement_booked"  # zamerga yozildi
    MEASURED = "measured"  # zamer qilindi
    QUOTED = "quoted"  # dizayn / smeta berildi
    CONTRACT = "contract"  # shartnoma + avans
    PRODUCTION = "production"  # ishlab chiqarishda
    INSTALLATION = "installation"  # o'rnatish
    DONE = "done"  # yopildi
    LOST = "lost"  # yo'qotildi


class LeadTemperature(StrEnum):
    HOT = "hot"
    WARM = "warm"
    COLD = "cold"


class ConversationStatus(StrEnum):
    ACTIVE = "active"
    HANDOFF = "handoff"  # menejer qo'liga o'tdi, agent jim
    CLOSED = "closed"  # keraksiz suhbat — agent javob bermaydi


class Client(Base, TimestampMixin):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    district: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source: Mapped[str | None] = mapped_column(String(120), nullable=True)  # qaysi reklama / kanal
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    identities: Mapped[list["ClientIdentity"]] = relationship(back_populates="client")
    leads: Mapped[list["Lead"]] = relationship(back_populates="client")


class ClientIdentity(Base):
    """Bitta mijoz bir nechta kanalda bo'lishi mumkin (TG id, IG id, ...)."""

    __tablename__ = "client_identities"
    __table_args__ = (UniqueConstraint("channel", "external_id", name="uq_identity_channel_external"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(32))
    external_id: Mapped[str] = mapped_column(String(128))
    username: Mapped[str | None] = mapped_column(String(128), nullable=True)

    client: Mapped[Client] = relationship(back_populates="identities")


class Lead(Base, TimestampMixin):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default=LeadStatus.NEW, index=True)
    temperature: Mapped[str] = mapped_column(String(16), default=LeadTemperature.WARM)
    furniture_type: Mapped[str | None] = mapped_column(String(120), nullable=True)  # oshxona, shkaf...
    dimensions: Mapped[str | None] = mapped_column(String(255), nullable=True)
    budget: Mapped[str | None] = mapped_column(String(120), nullable=True)
    deadline: Mapped[str | None] = mapped_column(String(120), nullable=True)
    pain_points: Mapped[str | None] = mapped_column(Text, nullable=True)
    measurement_at: Mapped[str | None] = mapped_column(String(120), nullable=True)
    measurement_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    extra: Mapped[dict] = mapped_column(JSON, default=dict)

    client: Mapped[Client] = relationship(back_populates="leads")


class Conversation(Base, TimestampMixin):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default=ConversationStatus.ACTIVE)
    off_topic_count: Mapped[int] = mapped_column(Integer, default=0)
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", order_by="Message.id", cascade="all, delete-orphan"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # user | assistant | manager
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
