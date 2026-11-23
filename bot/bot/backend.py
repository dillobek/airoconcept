"""Backend API bilan aloqa. Bot o'zi hech qanday biznes mantiqni bilmaydi — hammasi backend agentida."""

import logging

import httpx

log = logging.getLogger(__name__)

FALLBACK = "Kechirasiz, hozir texnik nosozlik bor. Menejerimiz tez orada siz bilan bog'lanadi."


class BackendClient:
    def __init__(self, base_url: str, api_key: str, timeout: float = 60) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={"X-API-Key": api_key, "User-Agent": "airoconcept-bot/0.1"},
            timeout=timeout,
        )

    async def ask_agent(self, user_id: int, text: str, name: str | None, username: str | None) -> str | None:
        """Agent javobini qaytaradi. None — javob yubormaslik kerak (suhbat menejerda yoki yopilgan)."""
        try:
            r = await self._client.post(
                "/api/v1/agent/message",
                json={
                    "channel": "telegram",
                    "external_user_id": str(user_id),
                    "text": text,
                    "name": name,
                    "username": username,
                },
            )
            r.raise_for_status()
            return r.json().get("reply")
        except httpx.HTTPError as e:
            log.error("backend xatosi: %s", type(e).__name__)
            return FALLBACK

    async def close(self) -> None:
        await self._client.aclose()
