from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_db
from app.core.deps import Principal, client_ip, require_scopes
from app.models import Conversation
from app.schemas import ConversationOut, ConversationStatusIn
from app.services.audit import audit

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.patch("/{conversation_id}/status", response_model=ConversationOut)
async def set_status(
    conversation_id: int,
    data: ConversationStatusIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    p: Principal = Depends(require_scopes("leads:write")),
):
    """Menejer suhbatni o'z qo'liga oladi (handoff) yoki agentga qaytaradi (active)."""
    conv = (
        await db.execute(
            select(Conversation).options(selectinload(Conversation.messages)).where(Conversation.id == conversation_id)
        )
    ).scalar_one_or_none()
    if not conv:
        raise HTTPException(404, "Suhbat topilmadi")
    old = conv.status
    conv.status = data.status
    if data.status == "active":
        conv.off_topic_count = 0
    await audit(
        db,
        p.actor,
        "conversation.status",
        "conversation",
        conv.id,
        {"from": old, "to": data.status},
        client_ip(request),
    )
    await db.commit()
    return conv
