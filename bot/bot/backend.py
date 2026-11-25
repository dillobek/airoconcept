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

    async def _finance_request(
        self,
        method: str,
        path: str,
        *,
        json: dict | None = None,
        params: dict | None = None,
    ) -> dict:
        try:
            response = await self._client.request(method, path, json=json, params=params)
            if response.is_error:
                try:
                    detail = response.json().get("detail")
                except ValueError:
                    detail = None
                return {"error": detail or "CRM bilan aloqa xatosi"}
            return response.json()
        except httpx.HTTPError as exc:
            log.error("finance backend xatosi: %s", type(exc).__name__)
            return {"error": "CRM bilan aloqa qilib bo'lmadi"}

    async def finance_me(self, chat_id: int) -> dict:
        return await self._finance_request("GET", f"/api/v1/telegram/finance/me/{chat_id}")

    async def create_finance_entry(self, chat_id: int, payload: dict) -> dict:
        return await self._finance_request(
            "POST",
            "/api/v1/telegram/finance/entries",
            json={"telegram_chat_id": str(chat_id), **payload},
        )

    async def create_debt(self, chat_id: int, payload: dict) -> dict:
        return await self._finance_request(
            "POST",
            "/api/v1/telegram/finance/debts",
            json={"telegram_chat_id": str(chat_id), **payload},
        )

    async def create_debt_payment(self, chat_id: int, debt_id: int, payload: dict) -> dict:
        return await self._finance_request(
            "POST",
            f"/api/v1/telegram/finance/debts/{debt_id}/payment",
            json={"telegram_chat_id": str(chat_id), **payload},
        )

    async def finance_report(self, chat_id: int, period: str) -> dict:
        return await self._finance_request(
            "POST",
            "/api/v1/telegram/finance/report",
            json={"telegram_chat_id": str(chat_id), "period": period},
        )

    async def order_finance(self, chat_id: int, order_id: int) -> dict:
        return await self._finance_request(
            "GET",
            f"/api/v1/telegram/finance/orders/{order_id}",
            params={"telegram_chat_id": str(chat_id)},
        )

    async def approve_finance_entry(self, chat_id: int, entry_id: int) -> dict:
        return await self._finance_request(
            "POST",
            f"/api/v1/telegram/finance/entries/{entry_id}/approve",
            json={"telegram_chat_id": str(chat_id)},
        )

    async def close(self) -> None:
        await self._client.aclose()
