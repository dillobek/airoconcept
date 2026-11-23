"""Fon vazifalari (ARQ + Redis). Ishga tushirish: uv run arq app.workers.worker.WorkerSettings"""

from arq.connections import RedisSettings

from app.agents.sales.agent import sales_agent
from app.channels.meta import meta_adapter
from app.core.config import settings
from app.core.db import SessionLocal
from app.core.logging import log, setup_logging


async def process_meta_event(ctx: dict, payload: dict) -> int:
    """Meta webhookidan kelgan xabarlarni agentga beradi va javobni qaytaradi."""
    handled = 0
    for msg in meta_adapter.parse(payload):
        async with SessionLocal() as db:
            reply = await sales_agent.handle(db, msg.channel, msg.sender_id, msg.text)
        if reply:
            await meta_adapter.send_text(msg.sender_id, reply)
        handled += 1
    log.info("meta_event.processed", count=handled)
    return handled


async def startup(ctx: dict) -> None:
    setup_logging(settings.DEBUG)


class WorkerSettings:
    functions = [process_meta_event]
    on_startup = startup
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_tries = 3
    job_timeout = 120
