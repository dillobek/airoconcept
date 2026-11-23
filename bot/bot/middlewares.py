import time
from collections.abc import Awaitable, Callable
from typing import Any

from aiogram import BaseMiddleware
from aiogram.types import Message, TelegramObject


class ThrottleMiddleware(BaseMiddleware):
    """Bitta foydalanuvchi juda tez-tez yozsa (spam) — ortiqcha xabarlar e'tiborsiz qoldiriladi."""

    def __init__(self, min_interval: float = 1.0) -> None:
        self.min_interval = min_interval
        self._last: dict[int, float] = {}

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        if isinstance(event, Message) and event.from_user:
            now = time.monotonic()
            uid = event.from_user.id
            if now - self._last.get(uid, 0) < self.min_interval:
                return None
            self._last[uid] = now
            if len(self._last) > 50_000:  # xotira o'sib ketmasligi uchun
                self._last.clear()
        return await handler(event, data)
