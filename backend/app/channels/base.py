"""Har bir kanal (Instagram, Messenger, sayt ...) shu interfeysni bajaradi.
Yangi kanal qo'shish = shu papkaga yangi adapter yozish. Yadroga tegilmaydi."""

from dataclasses import dataclass
from typing import Protocol


@dataclass
class IncomingMessage:
    channel: str  # app.models.Channel qiymati
    sender_id: str
    text: str
    name: str | None = None
    username: str | None = None


class ChannelAdapter(Protocol):
    name: str

    def parse(self, payload: dict) -> list[IncomingMessage]: ...

    async def send_text(self, recipient_id: str, text: str) -> bool: ...
