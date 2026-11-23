"""Sotuvchi agent ishlata oladigan tool'lar.

MUHIM: agent faqat shu ro'yxatdagi amallarni bajara oladi. Moliya, boshqa mijozlar, reklama
boshqaruvi kabi narsalar bu yerda yo'q — prompt injection bo'lsa ham agent ularga yeta olmaydi.
"""

import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.sales.prompt import load_knowledge
from app.models import Client, Conversation, ConversationStatus, Lead, LeadStatus, LeadTemperature
from app.services.audit import audit
from app.services.crm import AGENT_WRITABLE_LEAD_FIELDS
from app.services.notify import notify_manager

OFF_TOPIC_LIMIT = 2
PHONE_RE = re.compile(r"^\+?998\d{9}$")


@dataclass
class ToolContext:
    db: AsyncSession
    client: Client
    conversation: Conversation
    lead: Lead
    stop_replying: bool = False  # True bo'lsa agent javob yubormaydi


TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "get_price_range",
        "description": "Mebel turi bo'yicha taxminiy narx oralig'ini qaytaradi.",
        "input_schema": {
            "type": "object",
            "properties": {
                "furniture_type": {
                    "type": "string",
                    "enum": ["oshxona", "shkaf-kupe", "garderob", "yotoqxona", "ofis", "boshqa"],
                }
            },
            "required": ["furniture_type"],
        },
    },
    {
        "name": "get_portfolio",
        "description": "Mebel turi bo'yicha bajarilgan ishlar havolalarini qaytaradi.",
        "input_schema": {
            "type": "object",
            "properties": {"furniture_type": {"type": "string"}},
            "required": ["furniture_type"],
        },
    },
    {
        "name": "update_lead",
        "description": "Mijoz ehtiyoji haqida yangi ma'lumotni CRM'ga saqlaydi. Faqat ma'lum maydonlarni yubor.",
        "input_schema": {
            "type": "object",
            "properties": {
                "furniture_type": {"type": "string"},
                "dimensions": {"type": "string"},
                "budget": {"type": "string"},
                "deadline": {"type": "string"},
                "pain_points": {"type": "string", "description": "Mijozning muammosi, nimasi yoqmaydi"},
                "district": {"type": "string"},
                "temperature": {"type": "string", "enum": ["hot", "warm", "cold"]},
            },
        },
    },
    {
        "name": "save_contact",
        "description": "Mijoz ismi va telefon raqamini saqlaydi. Telefon formati: +998XXXXXXXXX.",
        "input_schema": {
            "type": "object",
            "properties": {"name": {"type": "string"}, "phone": {"type": "string"}},
            "required": ["phone"],
        },
    },
    {
        "name": "book_measurement",
        "description": "Bepul zamerga yozadi va menejerga xabar beradi. Avval telefon saqlangan bo'lishi kerak.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date_time": {"type": "string", "description": "Kelishilgan kun va vaqt"},
                "address": {"type": "string"},
            },
            "required": ["date_time", "address"],
        },
    },
    {
        "name": "handoff_to_manager",
        "description": "Suhbatni jonli menejerga o'tkazadi. Shundan keyin agent bu mijozga javob bermaydi.",
        "input_schema": {
            "type": "object",
            "properties": {"reason": {"type": "string"}},
            "required": ["reason"],
        },
    },
    {
        "name": "mark_off_topic",
        "description": "Xabar mebel buyurtmasiga aloqasiz bo'lsa chaqiriladi.",
        "input_schema": {"type": "object", "properties": {}},
    },
]


def normalize_phone(raw: str) -> str | None:
    digits = re.sub(r"[^\d+]", "", raw)
    if digits.startswith("998"):
        digits = "+" + digits
    elif len(digits) == 9 and digits.isdigit():
        digits = "+998" + digits
    return digits if PHONE_RE.match(digits) else None


def _lead_summary(ctx: ToolContext) -> str:
    lead, client = ctx.lead, ctx.client
    return (
        f"👤 {client.name or '—'} | 📞 {client.phone or '—'}\n"
        f"🪑 {lead.furniture_type or '—'} | 📐 {lead.dimensions or '—'}\n"
        f"💰 {lead.budget or '—'} | ⏱ {lead.deadline or '—'}\n"
        f"📍 {client.district or '—'} | kanal: {lead.channel}\n"
        f"Lead #{lead.id}"
    )


async def run_tool(ctx: ToolContext, name: str, args: dict[str, Any]) -> str:
    k = load_knowledge()

    if name == "get_price_range":
        p = k["prices"].get(args.get("furniture_type", ""), k["prices"]["boshqa"])
        return f"Narx: {p['range']} ({p['unit']}). {p['note']}. Aniq narx zamerdan keyin."

    if name == "get_portfolio":
        links = k["portfolio"].get(args.get("furniture_type", ""), [])
        return "\n".join(links) if links else "Bu tur bo'yicha portfolio hali qo'shilmagan."

    if name == "update_lead":
        changed = {}
        for f, v in args.items():
            if f == "district" and v:
                ctx.client.district = str(v)[:120]
                changed[f] = v
            elif f in AGENT_WRITABLE_LEAD_FIELDS and v:
                if f == "temperature" and v not in {t.value for t in LeadTemperature}:
                    continue
                setattr(ctx.lead, f, str(v)[:500])
                changed[f] = v
        if ctx.lead.status == LeadStatus.NEW and ctx.lead.furniture_type:
            ctx.lead.status = LeadStatus.QUALIFIED
        await audit(ctx.db, "agent", "lead.update", "lead", ctx.lead.id, changed)
        return "Saqlandi."

    if name == "save_contact":
        phone = normalize_phone(str(args.get("phone", "")))
        if not phone:
            return "Telefon formati noto'g'ri. Mijozdan +998XXXXXXXXX formatida so'ra."
        ctx.client.phone = phone
        if args.get("name"):
            ctx.client.name = str(args["name"])[:255]
        ctx.lead.temperature = LeadTemperature.HOT
        await audit(ctx.db, "agent", "client.contact", "client", ctx.client.id, {"phone": phone})
        await notify_manager("🔥 <b>Issiq lead — telefon olindi</b>\n" + _lead_summary(ctx))
        return "Kontakt saqlandi."

    if name == "book_measurement":
        if not ctx.client.phone:
            return "Avval telefon raqamini ol (save_contact)."
        ctx.lead.measurement_at = str(args["date_time"])[:120]
        ctx.lead.measurement_address = str(args["address"])[:255]
        ctx.lead.status = LeadStatus.MEASUREMENT_BOOKED
        ctx.lead.temperature = LeadTemperature.HOT
        await audit(ctx.db, "agent", "lead.measurement_booked", "lead", ctx.lead.id, args)
        await notify_manager(
            "📏 <b>Zamerga yozildi</b>\n"
            f"🗓 {ctx.lead.measurement_at}\n🏠 {ctx.lead.measurement_address}\n" + _lead_summary(ctx)
        )
        return "Zamer belgilandi. Mijozga menejer tasdiqlash uchun qo'ng'iroq qilishini ayt."

    if name == "handoff_to_manager":
        ctx.conversation.status = ConversationStatus.HANDOFF
        await audit(ctx.db, "agent", "conversation.handoff", "conversation", ctx.conversation.id, args)
        await notify_manager(f"🙋 <b>Menejer kerak</b>\nSabab: {args.get('reason', '—')}\n" + _lead_summary(ctx))
        return "Menejerga o'tkazildi. Mijozga menejer tez orada yozishini ayt."

    if name == "mark_off_topic":
        ctx.conversation.off_topic_count += 1
        if ctx.conversation.off_topic_count >= OFF_TOPIC_LIMIT:
            ctx.conversation.status = ConversationStatus.CLOSED
            ctx.stop_replying = True
            await audit(ctx.db, "agent", "conversation.closed_off_topic", "conversation", ctx.conversation.id)
            return "Suhbat yopildi. Javob yozma."
        return "Bitta qisqa jumla bilan mebel mavzusiga qaytar."

    return f"Noma'lum tool: {name}"
