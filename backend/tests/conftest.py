import os

from cryptography.fernet import Fernet

os.environ.update(
    {
        "DATABASE_URL": "sqlite+aiosqlite:///./test.db",
        "SECRET_KEY": "test-secret-key-test-secret-key-0123456789",
        "ENCRYPTION_KEY": Fernet.generate_key().decode(),
        "COOKIE_SECURE": "false",
        "META_APP_SECRET": "meta-secret",
        "META_VERIFY_TOKEN": "verify-me",
        "ANTHROPIC_API_KEY": "",
        "TELEGRAM_BOT_TOKEN": "",
        "ENV": "test",
    }
)

import httpx  # noqa: E402
import pytest  # noqa: E402

from app.agents.sales.agent import LLMResponse, ToolCall, sales_agent  # noqa: E402
from app.core.db import SessionLocal, engine  # noqa: E402
from app.core.security import generate_api_key, hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import ApiKey, Base, User  # noqa: E402


class FakeLLM:
    """Haqiqiy API'ga murojaat qilmaydigan soxta LLM. Navbat bilan javoblarni qaytaradi."""

    def __init__(self, responses: list[LLMResponse]):
        self.responses = list(responses)
        self.calls: list[list[dict]] = []

    async def complete(self, system, messages, tools):
        self.calls.append(messages)
        return self.responses.pop(0) if self.responses else LLMResponse(text="Qanday mebel kerak?")


def tool(tool_name: str, /, **inp) -> LLMResponse:
    return LLMResponse(
        text="",
        tool_calls=[ToolCall(id=f"t_{tool_name}", name=tool_name, input=inp)],
        raw_content=[{"type": "tool_use", "id": f"t_{tool_name}", "name": tool_name, "input": inp}],
    )


@pytest.fixture(autouse=True)
async def db_setup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    sales_agent._llm = None


@pytest.fixture
def enqueued():
    jobs: list[tuple] = []

    async def fake_enqueue(fn, *args):
        jobs.append((fn, *args))

    app.state.enqueue = fake_enqueue
    return jobs


@pytest.fixture
async def client(enqueued):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def owner():
    async with SessionLocal() as db:
        u = User(email="owner@test.uz", full_name="Ega", role="owner", password_hash=hash_password("s3cret-password!"))
        db.add(u)
        await db.commit()
        return u


async def make_key(scopes: list[str]) -> str:
    raw, prefix, h = generate_api_key()
    async with SessionLocal() as db:
        db.add(ApiKey(name="test", prefix=prefix, key_hash=h, scopes=scopes))
        await db.commit()
    return raw
