from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.sales.tools import normalize_phone
from app.core.db import get_db
from app.core.deps import Principal, client_ip, require_scopes
from app.models import Channel, Conversation, Lead, LeadStatus, LeadTemperature
from app.schemas import ConversationOut, LeadOut, LeadPage, LeadUpdateIn, WebsiteLeadIn
from app.services import crm
from app.services.audit import audit
from app.services.notify import notify_manager

router = APIRouter(prefix="/leads", tags=["leads"])


@router.get("", response_model=LeadPage)
async def list_leads(
    status: str | None = None,
    temperature: str | None = None,
    channel: str | None = None,
    q: str | None = Query(default=None, max_length=100, description="Ism yoki telefon bo'yicha qidiruv"),
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: Principal = Depends(require_scopes("leads:read")),
):
    from app.models import Client

    stmt = select(Lead).join(Lead.client).options(selectinload(Lead.client))
    if status:
        stmt = stmt.where(Lead.status == status)
    if temperature:
        stmt = stmt.where(Lead.temperature == temperature)
    if channel:
        stmt = stmt.where(Lead.channel == channel)
    if q:
        like = f"%{q}%"
        stmt = stmt.where((Client.name.ilike(like)) | (Client.phone.ilike(like)))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(Lead.updated_at.desc()).limit(limit).offset(offset))).scalars().all()
    return LeadPage(items=list(rows), total=total)


@router.get("/{lead_id}", response_model=LeadOut)
async def get_lead(lead_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_scopes("leads:read"))):
    lead = (
        await db.execute(select(Lead).options(selectinload(Lead.client)).where(Lead.id == lead_id))
    ).scalar_one_or_none()
    if not lead:
        raise HTTPException(404, "Lead topilmadi")
    return lead


@router.patch("/{lead_id}", response_model=LeadOut)
async def update_lead(
    lead_id: int,
    data: LeadUpdateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    p: Principal = Depends(require_scopes("leads:write")),
):
    lead = (
        await db.execute(select(Lead).options(selectinload(Lead.client)).where(Lead.id == lead_id))
    ).scalar_one_or_none()
    if not lead:
        raise HTTPException(404, "Lead topilmadi")
    changes = data.model_dump(exclude_unset=True)
    if "status" in changes and changes["status"] not in {s.value for s in LeadStatus}:
        raise HTTPException(422, "Noto'g'ri status")
    if "temperature" in changes and changes["temperature"] not in {t.value for t in LeadTemperature}:
        raise HTTPException(422, "Noto'g'ri temperature")
    for k, v in changes.items():
        setattr(lead, k, v)
    await audit(db, p.actor, "lead.update", "lead", lead.id, changes, ip=client_ip(request))
    await db.commit()
    await db.refresh(lead, attribute_names=["updated_at"])
    return lead


@router.get("/{lead_id}/conversation", response_model=ConversationOut | None)
async def lead_conversation(
    lead_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_scopes("conversations:read"))
):
    lead = await db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(404, "Lead topilmadi")
    stmt = (
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.client_id == lead.client_id)
        .order_by(Conversation.last_message_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


@router.post("/website", response_model=LeadOut, status_code=201)
async def website_lead(
    data: WebsiteLeadIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    p: Principal = Depends(require_scopes("leads:write")),
):
    """Sayt formasi. Sayt serveri API kalit bilan chaqiradi (kalit brauzerga chiqmaydi)."""
    phone = normalize_phone(data.phone)
    if not phone:
        raise HTTPException(422, "Telefon formati noto'g'ri (+998XXXXXXXXX)")
    client = await crm.get_or_create_client(db, Channel.WEBSITE, phone, data.name)
    client.phone = phone
    lead = await crm.get_open_lead(db, client, Channel.WEBSITE)
    lead.furniture_type = data.furniture_type or lead.furniture_type
    lead.temperature = LeadTemperature.HOT
    if data.message:
        conv = await crm.get_conversation(db, client, Channel.WEBSITE)
        await crm.add_message(db, conv, "user", data.message)
    await audit(db, p.actor, "lead.website_form", "lead", lead.id, ip=client_ip(request))
    await db.commit()
    await notify_manager(
        f"🌐 <b>Saytdan murojaat</b>\n👤 {data.name} | 📞 {phone}\n🪑 {data.furniture_type or '—'}\n"
        f"💬 {(data.message or '—')[:300]}\nLead #{lead.id}"
    )
    lead = (await db.execute(select(Lead).options(selectinload(Lead.client)).where(Lead.id == lead.id))).scalar_one()
    return lead
