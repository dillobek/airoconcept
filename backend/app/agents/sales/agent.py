"""Sotuvchi AI agent: barcha kanallar (Telegram, Instagram, Messenger, sayt) uchun yagona miya."""

from dataclasses import dataclass, field
from datetime import UTC, datetime, time
from typing import Any, Protocol

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.sales import guardrails
from app.agents.sales.prompt import system_prompt
from app.agents.sales.tools import TOOL_DEFINITIONS, ToolContext, run_tool
from app.core.config import settings
from app.core.logging import log
from app.models import ConversationStatus, Message
from app.services import crm
from app.services.notify import notify_manager

MAX_TOOL_ROUNDS = 5


@dataclass
class ToolCall:
    id: str
    name: str
    input: dict[str, Any]


@dataclass
class LLMResponse:
    text: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    raw_content: list[dict[str, Any]] = field(default_factory=list)


class LLM(Protocol):
    async def complete(self, system: str, messages: list[dict], tools: list[dict]) -> LLMResponse: ...


class AnthropicLLM:
    def __init__(self) -> None:
        from anthropic import AsyncAnthropic

        self.client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY.get_secret_value())

    async def complete(self, system: str, messages: list[dict], tools: list[dict]) -> LLMResponse:
        r = await self.client.messages.create(
            model=settings.LLM_MODEL,
            max_tokens=settings.LLM_MAX_TOKENS,
            system=system,
            messages=messages,
            tools=tools,
        )
        text_parts, calls, raw = [], [], []
        for block in r.content:
            if block.type == "text":
                text_parts.append(block.text)
                raw.append({"type": "text", "text": block.text})
            elif block.type == "tool_use":
                calls.append(ToolCall(id=block.id, name=block.name, input=dict(block.input)))
                raw.append({"type": "tool_use", "id": block.id, "name": block.name, "input": block.input})
        return LLMResponse(text="\n".join(text_parts).strip(), tool_calls=calls, raw_content=raw)


def _history_to_messages(history: list[Message]) -> list[dict]:
    """Bazadagi tarixni Anthropic formatiga o'tkazadi (ketma-ket bir xil rollar birlashtiriladi)."""
    out: list[dict] = []
    for m in history:
        role = "user" if m.role == "user" else "assistant"
        if out and out[-1]["role"] == role:
            out[-1]["content"] += "\n" + m.text
        else:
            out.append({"role": role, "content": m.text})
    while out and out[0]["role"] != "user":
        out.pop(0)
    return out


class SalesAgent:
    def __init__(self, llm: LLM | None = None) -> None:
        self._llm = llm

    @property
    def llm(self) -> LLM | None:
        if self._llm is None and settings.ANTHROPIC_API_KEY.get_secret_value():
            self._llm = AnthropicLLM()
        return self._llm

    async def _user_messages_today(self, db: AsyncSession, conversation_id: int) -> int:
        start = datetime.combine(datetime.now(UTC).date(), time.min, tzinfo=UTC)
        q = select(func.count(Message.id)).where(
            Message.conversation_id == conversation_id, Message.role == "user", Message.created_at >= start
        )
        return int((await db.execute(q)).scalar_one())

    async def handle(
        self,
        db: AsyncSession,
        channel: str,
        external_id: str,
        text: str,
        name: str | None = None,
        username: str | None = None,
    ) -> str | None:
        """Mijoz xabarini qayta ishlaydi. Javob matnini yoki None (javob bermaslik) qaytaradi."""
        clean = guardrails.clean_input(text)
        if clean is None:
            return None

        client = await crm.get_or_create_client(db, channel, external_id, name, username)
        conv = await crm.get_conversation(db, client, channel)
        await crm.add_message(db, conv, "user", clean)

        # Menejerga o'tgan yoki yopilgan suhbatlarga agent javob bermaydi
        if conv.status != ConversationStatus.ACTIVE:
            await db.commit()
            return None

        # Spam / xarajatdan himoya
        if await self._user_messages_today(db, conv.id) > settings.LLM_DAILY_MESSAGE_LIMIT_PER_USER:
            await db.commit()
            return None

        lead = await crm.get_open_lead(db, client, channel)
        ctx = ToolContext(db=db, client=client, conversation=conv, lead=lead)

        if self.llm is None:
            reply = guardrails.SAFE_FALLBACK
            await notify_manager(f"✉️ Yangi xabar ({channel}): {clean[:300]}\nLead #{lead.id}")
        else:
            reply = await self._run_llm(ctx)

        if ctx.stop_replying or not reply:
            await db.commit()
            return None

        reply = guardrails.filter_output(reply)
        await crm.add_message(db, conv, "assistant", reply)
        await db.commit()
        return reply

    async def _run_llm(self, ctx: ToolContext) -> str | None:
        assert self.llm is not None
        history = await crm.recent_messages(ctx.db, ctx.conversation, limit=20)
        messages = _history_to_messages(history)
        system = system_prompt()

        try:
            for _ in range(MAX_TOOL_ROUNDS):
                resp = await self.llm.complete(system, messages, TOOL_DEFINITIONS)
                if not resp.tool_calls:
                    return resp.text
                messages.append({"role": "assistant", "content": resp.raw_content})
                results = []
                for call in resp.tool_calls:
                    result = await run_tool(ctx, call.name, call.input)
                    results.append({"type": "tool_result", "tool_use_id": call.id, "content": result})
                messages.append({"role": "user", "content": results})
                if ctx.stop_replying:
                    return None
            return resp.text or None
        except Exception as e:  # LLM xatosi mijozga ko'rinmasligi kerak
            log.error("sales_agent.llm_error", error=str(e))
            await notify_manager(f"⚠️ Agent xatosi, mijozga qo'lda javob bering. Lead #{ctx.lead.id}")
            return guardrails.SAFE_FALLBACK


sales_agent = SalesAgent()
