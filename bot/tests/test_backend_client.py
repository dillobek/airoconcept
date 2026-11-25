import httpx
import respx

from bot.backend import FALLBACK, BackendClient


@respx.mock
async def test_ask_agent_returns_reply_and_sends_key():
    route = respx.post("http://api.test/api/v1/agent/message").mock(
        return_value=httpx.Response(200, json={"reply": "Salom!"})
    )
    c = BackendClient("http://api.test", "aic_live_x")
    assert await c.ask_agent(1, "salom", "Aziz", "aziz") == "Salom!"
    req = route.calls.last.request
    assert req.headers["X-API-Key"] == "aic_live_x"
    assert b'"channel":"telegram"' in req.content.replace(b" ", b"")
    await c.close()


@respx.mock
async def test_ask_agent_none_reply():
    respx.post("http://api.test/api/v1/agent/message").mock(return_value=httpx.Response(200, json={"reply": None}))
    c = BackendClient("http://api.test", "k")
    assert await c.ask_agent(1, "x", None, None) is None
    await c.close()


@respx.mock
async def test_ask_agent_backend_down_fallback():
    respx.post("http://api.test/api/v1/agent/message").mock(return_value=httpx.Response(500))
    c = BackendClient("http://api.test", "k")
    assert await c.ask_agent(1, "x", None, None) == FALLBACK
    await c.close()


@respx.mock
async def test_finance_report_sends_telegram_identity():
    route = respx.post("http://api.test/api/v1/telegram/finance/report").mock(
        return_value=httpx.Response(200, json={"income": "1200.00", "expense": "200.00", "profit": "1000.00"})
    )
    c = BackendClient("http://api.test", "aic_live_x")
    result = await c.finance_report(99887766, "month")
    assert result["profit"] == "1000.00"
    request = route.calls.last.request
    assert request.headers["X-API-Key"] == "aic_live_x"
    assert b'"telegram_chat_id":"99887766"' in request.content.replace(b" ", b"")
    assert b'"period":"month"' in request.content.replace(b" ", b"")
    await c.close()
