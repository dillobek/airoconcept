"""Menejer va egasiga Telegram orqali xabar yuborish."""

import httpx

from app.core.config import settings
from app.core.logging import log


async def notify_manager(text: str) -> bool:
    token = settings.TELEGRAM_BOT_TOKEN.get_secret_value()
    chat_id = settings.MANAGER_CHAT_ID
    if not token or not chat_id:
        log.warning("notify_manager.skipped", reason="TELEGRAM_BOT_TOKEN yoki MANAGER_CHAT_ID yo'q")
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True},
            )
            return r.status_code == 200
    except httpx.HTTPError as e:
        log.error("notify_manager.failed", error=str(e))
        return False
