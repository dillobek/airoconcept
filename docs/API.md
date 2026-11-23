# API — tashqi dasturlar uchun

To'liq interaktiv hujjat: `http://localhost:8000/docs` (Swagger) va `/redoc`. Serverda xavfsizlik uchun
yopiq (`DOCS_ENABLED=false`), kerak bo'lganda vaqtincha yoqiladi.

## Autentifikatsiya

Har bir so'rovda `X-API-Key` header:

```bash
curl -H "X-API-Key: aic_live_..." https://api.airoconcept.uz/api/v1/leads
```

Kalit yaratish: admin panel → **API kalitlar** yoki
`uv run python -m app.cli create-api-key --name "..." --scopes leads:read`.

- Kalit **faqat bir marta** ko'rsatiladi. Bazada faqat SHA-256 hash saqlanadi.
- Har bir kalitga faqat kerakli **scope**lar beriladi.
- Ixtiyoriy: ruxsat etilgan IP ro'yxati, amal qilish muddati.
- Kalit istalgan payt bekor qilinadi (revoke).

## Scope'lar

| Scope | Ruxsat |
|---|---|
| `agent:chat` | `POST /api/v1/agent/message` — agentga xabar yuborish (bot, sayt chat) |
| `leads:read` | Leadlar ro'yxati va tafsiloti |
| `leads:write` | Lead yaratish/o'zgartirish, sayt formasi |
| `conversations:read` | Suhbat tarixi |
| `clients:read` / `clients:write` | Mijozlar |
| `finance:read` / `finance:write` | Moliya (keyingi bosqich) |
| `tasks:read` / `tasks:write` | Ishchilar vazifalari (keyingi bosqich) |

## Asosiy endpointlar

| Metod | Yo'l | Scope |
|---|---|---|
| POST | `/api/v1/agent/message` | `agent:chat` |
| GET | `/api/v1/leads?status=&temperature=&channel=&q=&limit=&offset=` | `leads:read` |
| GET | `/api/v1/leads/{id}` | `leads:read` |
| PATCH | `/api/v1/leads/{id}` | `leads:write` |
| GET | `/api/v1/leads/{id}/conversation` | `conversations:read` |
| POST | `/api/v1/leads/website` | `leads:write` |
| PATCH | `/api/v1/conversations/{id}/status` | `leads:write` |

### Misol: agentga xabar
```bash
curl -X POST https://api.airoconcept.uz/api/v1/agent/message \
  -H "X-API-Key: aic_live_..." -H "Content-Type: application/json" \
  -d '{"channel":"telegram","external_user_id":"123456","text":"Oshxona kerak","name":"Aziz"}'
# {"reply":"Assalomu alaykum, Aziz! Oshxonangiz taxminan necha metr bo'ladi?"}
```
`reply: null` — mijozga hech narsa yuborilmaydi (suhbat menejerda yoki yopilgan).

## Xatolar
| Kod | Ma'nosi |
|---|---|
| 401 | Kalit yo'q, noto'g'ri, bekor qilingan yoki muddati tugagan |
| 403 | Scope yetarli emas yoki IP ruxsat etilmagan |
| 422 | Ma'lumot formati noto'g'ri |
| 429 | So'rovlar limiti oshdi |

## Chiquvchi webhooklar (rejada)
"Yangi lead", "bosqich o'zgardi", "to'lov tushdi" hodisalari tashqi dasturga `X-Airo-Signature: sha256=...`
(HMAC-SHA256) imzosi bilan yuboriladi. Imzo funksiyasi tayyor: `app/core/security.py → sign_payload()`.
