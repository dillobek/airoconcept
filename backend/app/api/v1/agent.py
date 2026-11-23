from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.sales.agent import sales_agent
from app.core.db import get_db
from app.core.deps import require_scopes
from app.core.ratelimit import limiter
from app.schemas import AgentMessageIn, AgentMessageOut

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/message", response_model=AgentMessageOut)
@limiter.limit("120/minute")
async def agent_message(
    request: Request,
    data: AgentMessageIn,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_scopes("agent:chat")),
):
    """Telegram bot va sayt chat shu endpoint orqali agentga murojaat qiladi.
    `reply` null bo'lsa — mijozga hech narsa yuborilmaydi (suhbat yopilgan yoki menejerda)."""
    reply = await sales_agent.handle(db, data.channel, data.external_user_id, data.text, data.name, data.username)
    return AgentMessageOut(reply=reply)
