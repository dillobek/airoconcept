"""Facebook Messenger va Instagram DM adapteri (Facebook Login + Page token yo'li)."""

import httpx

from app.channels.base import IncomingMessage
from app.core.config import settings
from app.core.logging import log
from app.models import Channel


class MetaAdapter:
    name = "meta"

    @property
    def graph(self) -> str:
        return f"https://graph.facebook.com/{settings.META_GRAPH_VERSION}"

    def parse(self, payload: dict) -> list[IncomingMessage]:
        """Webhook payloadidan matnli xabarlarni ajratadi. Echo (o'zimiz yuborgan) xabarlar tashlab yuboriladi."""
        obj = payload.get("object")
        channel = {"page": Channel.MESSENGER, "instagram": Channel.INSTAGRAM}.get(obj)
        if channel is None:
            return []
        own_ids = {settings.META_PAGE_ID, settings.META_IG_USER_ID} - {""}
        out: list[IncomingMessage] = []
        for entry in payload.get("entry", []):
            for ev in entry.get("messaging", []):
                msg = ev.get("message") or {}
                sender = (ev.get("sender") or {}).get("id")
                if not sender or msg.get("is_echo") or sender in own_ids:
                    continue
                text = msg.get("text")
                if not text and msg.get("attachments"):
                    text = "[mijoz rasm/fayl yubordi]"
                if text:
                    out.append(IncomingMessage(channel=channel.value, sender_id=str(sender), text=text))
        return out

    async def send_text(self, recipient_id: str, text: str) -> bool:
        token = settings.META_PAGE_TOKEN.get_secret_value()
        if not token:
            log.warning("meta.send.skipped", reason="META_PAGE_TOKEN yo'q")
            return False
        body = {"recipient": {"id": recipient_id}, "messaging_type": "RESPONSE", "message": {"text": text}}
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{self.graph}/me/messages", params={"access_token": token}, json=body)
        if r.status_code != 200:
            log.error("meta.send.failed", status=r.status_code, body=r.text[:500])
            return False
        return True


meta_adapter = MetaAdapter()
