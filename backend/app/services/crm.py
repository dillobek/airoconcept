"""CRM bilan ishlash: mijozni topish/yaratish, suhbat, xabar, lead."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Client,
    ClientIdentity,
    Conversation,
    ConversationStatus,
    Lead,
    LeadStatus,
    Message,
)
from app.models.base import utcnow

CLOSED_LEAD_STATUSES = {LeadStatus.DONE, LeadStatus.LOST}

# Agent o'zgartira oladigan lead maydonlari (boshqa maydonlarga yozish taqiqlangan)
AGENT_WRITABLE_LEAD_FIELDS = {
    "furniture_type",
    "dimensions",
    "budget",
    "deadline",
    "pain_points",
    "temperature",
}


async def get_or_create_client(
    db: AsyncSession,
    channel: str,
    external_id: str,
    name: str | None = None,
    username: str | None = None,
) -> Client:
    q = select(ClientIdentity).where(ClientIdentity.channel == channel, ClientIdentity.external_id == external_id)
    identity = (await db.execute(q)).scalar_one_or_none()
    if identity:
        client = await db.get(Client, identity.client_id)
        assert client is not None
        if name and not client.name:
            client.name = name
        return client

    client = Client(name=name, source=channel)
    db.add(client)
    await db.flush()
    db.add(ClientIdentity(client_id=client.id, channel=channel, external_id=external_id, username=username))
    await db.flush()
    return client


async def get_conversation(db: AsyncSession, client: Client, channel: str) -> Conversation:
    q = (
        select(Conversation)
        .where(Conversation.client_id == client.id, Conversation.channel == channel)
        .order_by(Conversation.id.desc())
        .limit(1)
    )
    conv = (await db.execute(q)).scalar_one_or_none()
    if conv:
        return conv
    conv = Conversation(client_id=client.id, channel=channel)
    db.add(conv)
    await db.flush()
    return conv


async def add_message(db: AsyncSession, conv: Conversation, role: str, text: str) -> Message:
    msg = Message(conversation_id=conv.id, role=role, text=text)
    db.add(msg)
    conv.last_message_at = utcnow()
    await db.flush()
    return msg


async def recent_messages(db: AsyncSession, conv: Conversation, limit: int = 20) -> list[Message]:
    q = select(Message).where(Message.conversation_id == conv.id).order_by(Message.id.desc()).limit(limit)
    rows = list((await db.execute(q)).scalars())
    return list(reversed(rows))


async def get_open_lead(db: AsyncSession, client: Client, channel: str) -> Lead:
    q = (
        select(Lead)
        .where(Lead.client_id == client.id, Lead.status.not_in([s.value for s in CLOSED_LEAD_STATUSES]))
        .order_by(Lead.id.desc())
        .limit(1)
    )
    lead = (await db.execute(q)).scalar_one_or_none()
    if lead:
        return lead
    lead = Lead(client_id=client.id, channel=channel)
    db.add(lead)
    await db.flush()
    return lead


def mark_conversation(conv: Conversation, status: ConversationStatus) -> None:
    conv.status = status.value
