from app.agents.sales.agent import LLMResponse, sales_agent
from tests.conftest import FakeLLM, make_key, tool


async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.headers["X-Frame-Options"] == "DENY"


async def test_login_cookie_and_me(client, owner):
    r = await client.post("/api/v1/auth/login", json={"username": "owner", "password": "s3cret-password!"})
    assert r.status_code == 200
    assert "airo_session" in r.cookies
    assert "httponly" in r.headers["set-cookie"].lower()
    me = await client.get("/api/v1/auth/me")
    assert me.json()["role"] == "owner"


async def test_login_wrong_password(client, owner):
    r = await client.post("/api/v1/auth/login", json={"username": "owner", "password": "nope"})
    assert r.status_code == 401


async def test_change_username_and_password(client, owner):
    await client.post("/api/v1/auth/login", json={"username": "owner", "password": "s3cret-password!"})
    r = await client.patch(
        "/api/v1/auth/credentials",
        json={"current_password": "s3cret-password!", "username": "admin", "new_password": "new-secure-password!"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["username"] == "admin"
    client.cookies.clear()
    old = await client.post("/api/v1/auth/login", json={"username": "owner", "password": "s3cret-password!"})
    assert old.status_code == 401
    new = await client.post("/api/v1/auth/login", json={"username": "admin", "password": "new-secure-password!"})
    assert new.status_code == 200


async def test_unauthorized_without_credentials(client):
    assert (await client.get("/api/v1/leads")).status_code == 401
    assert (await client.get("/api/v1/leads", headers={"X-API-Key": "aic_live_fake"})).status_code == 401


async def test_api_key_scopes_enforced(client):
    key = await make_key(["agent:chat"])
    r = await client.get("/api/v1/leads", headers={"X-API-Key": key})
    assert r.status_code == 403


async def test_owner_creates_and_revokes_key(client, owner):
    await client.post("/api/v1/auth/login", json={"username": "owner", "password": "s3cret-password!"})
    r = await client.post("/api/v1/api-keys", json={"name": "Sayt", "scopes": ["leads:write"]})
    assert r.status_code == 201
    raw, kid = r.json()["key"], r.json()["id"]
    assert raw.startswith("aic_live_")
    assert (await client.post(f"/api/v1/api-keys/{kid}/revoke")).json()["revoked"] is True
    client.cookies.clear()
    r2 = await client.post(
        "/api/v1/leads/website", headers={"X-API-Key": raw}, json={"name": "A", "phone": "+998901234567"}
    )
    assert r2.status_code == 401


async def test_invalid_scope_rejected(client, owner):
    await client.post("/api/v1/auth/login", json={"username": "owner", "password": "s3cret-password!"})
    r = await client.post("/api/v1/api-keys", json={"name": "X", "scopes": ["admin:all"]})
    assert r.status_code == 422


async def test_website_lead(client):
    key = await make_key(["leads:write", "leads:read"])
    h = {"X-API-Key": key}
    r = await client.post(
        "/api/v1/leads/website",
        headers=h,
        json={"name": "Aziz", "phone": "90 123 45 67", "furniture_type": "oshxona", "message": "Oshxona kerak"},
    )
    assert r.status_code == 201, r.text
    lead = r.json()
    assert lead["client"]["phone"] == "+998901234567"
    assert lead["temperature"] == "hot"
    page = (await client.get("/api/v1/leads", headers=h)).json()
    assert page["total"] == 1


async def test_agent_flow_books_measurement(client):
    key = await make_key(["agent:chat", "leads:read", "conversations:read"])
    h = {"X-API-Key": key}
    sales_agent._llm = FakeLLM(
        [
            tool("update_lead", furniture_type="oshxona", pain_points="joy kam"),
            LLMResponse(text="Ajoyib! Telefon raqamingizni yozib qoldirasizmi?"),
            tool("save_contact", name="Aziz", phone="+998901234567"),
            tool("book_measurement", date_time="Shanba 11:00", address="Chilonzor 5"),
            LLMResponse(text="Zamerga yozdim, menejer qo'ng'iroq qiladi."),
        ]
    )
    base = {"channel": "telegram", "external_user_id": "777", "name": "Aziz"}
    r1 = await client.post("/api/v1/agent/message", headers=h, json={**base, "text": "Oshxona kerak, joy kichik"})
    assert r1.json()["reply"].startswith("Ajoyib")
    r2 = await client.post("/api/v1/agent/message", headers=h, json={**base, "text": "+998901234567, shanba 11da"})
    assert "Zamer" in r2.json()["reply"]

    leads = (await client.get("/api/v1/leads", headers=h)).json()["items"]
    assert leads[0]["status"] == "measurement_booked"
    assert leads[0]["client"]["phone"] == "+998901234567"
    conv = (await client.get(f"/api/v1/leads/{leads[0]['id']}/conversation", headers=h)).json()
    assert [m["role"] for m in conv["messages"]] == ["user", "assistant", "user", "assistant"]


async def test_agent_stops_after_off_topic(client):
    key = await make_key(["agent:chat"])
    h = {"X-API-Key": key}
    sales_agent._llm = FakeLLM(
        [
            tool("mark_off_topic"),
            LLMResponse(text="Biz mebel yasaymiz. Sizga qanday mebel kerak?"),
            tool("mark_off_topic"),
        ]
    )
    base = {"channel": "telegram", "external_user_id": "999"}
    r1 = await client.post("/api/v1/agent/message", headers=h, json={**base, "text": "ob-havo qanday?"})
    assert r1.json()["reply"]
    r2 = await client.post("/api/v1/agent/message", headers=h, json={**base, "text": "hazil aytib ber"})
    assert r2.json()["reply"] is None
    # Yopilgan suhbatga LLM umuman chaqirilmaydi
    calls_before = len(sales_agent._llm.calls)
    r3 = await client.post("/api/v1/agent/message", headers=h, json={**base, "text": "yana bir narsa"})
    assert r3.json()["reply"] is None and len(sales_agent._llm.calls) == calls_before


async def test_agent_without_llm_key_uses_fallback(client):
    key = await make_key(["agent:chat"])
    r = await client.post(
        "/api/v1/agent/message",
        headers={"X-API-Key": key},
        json={"channel": "telegram", "external_user_id": "1", "text": "salom"},
    )
    assert "menejer" in r.json()["reply"]
