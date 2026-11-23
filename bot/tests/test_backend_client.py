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
