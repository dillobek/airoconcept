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


async def test_finance_approval_debt_order_reports_and_exports(client, owner):
    await client.post("/api/v1/auth/login", json={"username": "owner", "password": "s3cret-password!"})

    order_response = await client.post(
        "/api/v1/finance/orders",
        json={"customer_name": "Test mijoz", "title": "Oshxona", "total_amount": "10000000.00"},
    )
    assert order_response.status_code == 201, order_response.text
    order_id = order_response.json()["id"]

    debt_response = await client.post(
        "/api/v1/finance/debts",
        json={
            "order_id": order_id,
            "direction": "receivable",
            "counterparty": "Test mijoz",
            "amount": "4000000.00",
        },
    )
    assert debt_response.status_code == 201, debt_response.text
    debt_id = debt_response.json()["id"]

    payment_response = await client.post(
        "/api/v1/finance/entries",
        json={
            "kind": "income",
            "amount": "1500000.00",
            "category": "Avans",
            "order_id": order_id,
            "debt_id": debt_id,
        },
    )
    assert payment_response.status_code == 201, payment_response.text
    entry_id = payment_response.json()["id"]
    assert payment_response.json()["status"] == "pending"

    before = (await client.get("/api/v1/finance/dashboard?period=month")).json()
    assert float(before["income"]) == 0
    assert float(before["receivable"]) == 4_000_000
    assert before["pending_approvals"] == 1

    approved = await client.post(f"/api/v1/finance/entries/{entry_id}/approve")
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    expense = await client.post(
        "/api/v1/finance/entries",
        json={
            "kind": "expense",
            "amount": "250000.00",
            "category": "Material",
            "order_id": order_id,
        },
    )
    assert expense.status_code == 201, expense.text
    assert (await client.post(f"/api/v1/finance/entries/{expense.json()['id']}/approve")).status_code == 200

    after = (await client.get("/api/v1/finance/dashboard?period=month")).json()
    assert float(after["income"]) == 1_500_000
    assert float(after["expense"]) == 250_000
    assert float(after["profit"]) == 1_250_000
    assert float(after["receivable"]) == 2_500_000

    order = (await client.get(f"/api/v1/finance/orders/{order_id}")).json()
    assert float(order["outstanding"]) == 8_500_000
    assert float(order["profit"]) == 1_250_000

    report = (await client.get("/api/v1/finance/report?period=month")).json()
    assert float(report["profit"]) == 1_250_000
    assert report["points"]

    xlsx = await client.get("/api/v1/finance/export.xlsx?period=month")
    assert xlsx.status_code == 200
    assert xlsx.headers["content-type"].startswith("application/vnd.openxmlformats")
    assert xlsx.content.startswith(b"PK")
    pdf = await client.get("/api/v1/finance/export.pdf?period=month")
    assert pdf.status_code == 200
    assert pdf.headers["content-type"].startswith("application/pdf")
    assert pdf.content.startswith(b"%PDF")


async def test_owner_manages_roles_and_telegram_finance(client, owner):
    await client.post("/api/v1/auth/login", json={"username": "owner", "password": "s3cret-password!"})
    created = await client.post(
        "/api/v1/users",
        json={
            "username": "hisobchi",
            "email": "hisobchi@test.uz",
            "full_name": "Test hisobchi",
            "role": "accountant",
            "password": "secure-password-2026",
            "telegram_chat_id": "99887766",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["role"] == "accountant"
    user_id = created.json()["id"]
    updated = await client.patch(f"/api/v1/users/{user_id}", json={"role": "manager"})
    assert updated.status_code == 200
    assert updated.json()["role"] == "manager"

    key = await make_key(["agent:chat"])
    headers = {"X-API-Key": key}
    me = await client.get("/api/v1/telegram/finance/me/99887766", headers=headers)
    assert me.status_code == 200
    report = await client.post(
        "/api/v1/telegram/finance/report",
        headers=headers,
        json={"telegram_chat_id": "99887766", "period": "day"},
    )
    assert report.status_code == 200
    forbidden = await client.post(
        "/api/v1/telegram/finance/entries",
        headers=headers,
        json={
            "telegram_chat_id": "99887766",
            "kind": "income",
            "amount": "1000.00",
            "category": "Test",
        },
    )
    assert forbidden.status_code == 403
