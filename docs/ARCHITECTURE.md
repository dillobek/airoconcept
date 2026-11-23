# Arxitektura

## Asosiy tamoyil: bitta miya, ko'p kanal

Barcha kanallar bitta backendga keladi. AI agent, bilim bazasi va CRM bitta. Yangi kanal qo'shish uchun faqat
adapter yoziladi, yadro o'zgarmaydi.

## Backend (`backend/app/`)

| Papka | Vazifasi |
|---|---|
| `core/` | Sozlamalar, baza, xavfsizlik (parol, JWT, API kalit, imzo, shifrlash), autentifikatsiya, log |
| `models/` | SQLAlchemy modellari: `User`, `ApiKey`, `AuditLog`, `Client`, `ClientIdentity`, `Lead`, `Conversation`, `Message` |
| `schemas/` | API kirish/chiqish sxemalari (Pydantic) |
| `api/v1/` | REST API: `auth`, `leads`, `conversations`, `api-keys`, `agent` |
| `api/webhooks/` | Meta webhook (imzo tekshiruvi → navbat) |
| `channels/` | Kanal adapterlari (`meta.py`). Har biri `parse()` va `send_text()` ni bajaradi |
| `agents/sales/` | Sotuvchi agent: `agent.py` (LLM sikli), `tools.py`, `prompt.py`, `guardrails.py`, `knowledge.json` |
| `services/` | CRM amallari, bildirishnomalar, audit |
| `workers/` | ARQ fon vazifalari (Meta xabarlarini qayta ishlash) |

### Xabar oqimi (Instagram misolida)
1. Meta `POST /webhooks/meta` yuboradi → `X-Hub-Signature-256` tekshiriladi.
2. Payload Redis navbatiga qo'yiladi, Meta'ga darhol `200` qaytadi.
3. Worker `meta_adapter.parse()` → `sales_agent.handle()` chaqiradi.
4. Agent: mijozni topadi/yaratadi → xabarni saqlaydi → suhbat holatini tekshiradi → LLM + tool'lar →
   javobni filtrlaydi → saqlaydi.
5. Worker javobni `meta_adapter.send_text()` bilan yuboradi.

### Suhbat holatlari
- `active` — agent javob beradi
- `handoff` — menejer qo'lida, agent jim (admin paneldan "Agentga qaytarish" mumkin)
- `closed` — 2 marta keraksiz mavzu bo'lgan, agent javob bermaydi va LLM chaqirilmaydi (xarajat yo'q)

## Yangi kanal qo'shish
1. `channels/yangi_kanal.py` — `parse()` va `send_text()`
2. Webhook kerak bo'lsa `api/webhooks/` ga router
3. `models/crm.py` → `Channel` enumiga qiymat

## Yangi modul qo'shish (masalan moliya)
1. `models/finance.py` → modellar, `models/__init__.py` ga eksport
2. `uv run alembic revision --autogenerate -m "moliya"` → `uv run alembic upgrade head`
3. `schemas/`, `api/v1/finance.py`, `api/v1/router.py` ga ulash
4. Scope'lar: `finance:read`, `finance:write` (allaqachon `ROLE_SCOPES` da bor)
5. Admin: `pnpm gen:api` → yangi sahifa

## Rejadagi keyingi modullar
- `modules/content` — Reels avto-post (IG + FB + TG kanal)
- `modules/ads` — Meta Ads yoqish/o'chirish qoidalari (faqat ACTIVE↔PAUSED, audit bilan)
- `modules/finance` — kirim/chiqim, to'lovlar
- `modules/staff` + boshqaruvchi agent — ishchilar vazifalari, kunlik hisobotlar
