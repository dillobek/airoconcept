# AiroConcept — mebel biznesi uchun AI agent tizimi

Buyurtma asosida mebel yasaydigan biznes uchun: Instagram, Facebook va Telegram'dagi mijozlarga AI sotuvchi
javob beradi, ma'lumotlarni CRM'ga saqlaydi, issiq leadlarni menejerga yetkazadi.

## Papkalar tuzilmasi

```
airoconcept/
├── backend/      Python + FastAPI — API, AI agent, CRM, Meta webhook, worker      (uv)
├── bot/          Python + aiogram — mijozlar uchun Telegram bot                    (uv)
├── admin/        React + Vite — boshqaruv paneli (leadlar, suhbatlar, API kalitlar) (pnpm)
├── frontend/     Next.js — ommaviy sayt (landing, zamer formasi, maxfiylik sahifalari) (pnpm)
├── deploy/       Caddyfile — HTTPS va domenlar
├── docs/         Arxitektura, API, Meta sozlash, xavfsizlik
└── docker-compose.yml
```

Har bir qism mustaqil: o'z `.env.example`, `Dockerfile` va bog'liqliklari bor. Ular bir-biri bilan faqat
**backend API** orqali gaplashadi (bot va sayt — API kalit bilan, admin — sessiya cookie bilan).

```
Instagram / Messenger ──webhook──► backend ──► AI agent ──► CRM (PostgreSQL)
Telegram ──► bot ──API kalit──►    backend        │
Sayt formasi ──► frontend ──API──► backend        └──► menejerga Telegram xabar
Admin panel ──cookie──────────►    backend
```

## Hozir nima tayyor (1-bosqich)

- **Sotuvchi AI agent**: ehtiyojni aniqlaydi, og'riq nuqtasiga ishlaydi, bepul zamerga yozadi, telefon oladi,
  keraksiz suhbatni 2-urinishda yopadi, kerak bo'lsa menejerga o'tkazadi
- **CRM yadrosi**: mijozlar, kanal identifikatorlari, leadlar (10 bosqich), suhbatlar, xabarlar
- **Kanallar**: Telegram bot, Instagram DM, Facebook Messenger, sayt formasi
- **Admin panel**: login (+2FA), leadlar ro'yxati va filtrlar, suhbat tarixi, "men javob beraman / agentga
  qaytarish", API kalitlarni boshqarish
- **Xavfsizlik**: argon2 parollar, httpOnly cookie, 2FA, RBAC rollar, scope'li API kalitlar (faqat hash
  saqlanadi), Meta imzo tekshiruvi, audit log, rate limit, loglarda tokenlarni maskalash
- **Testlar**: backend 23 ta, bot 3 ta

Keyingi bosqichlar: Reels avto-post, Meta Ads yoqish/o'chirish, moliya, ishchilar boti, boshqaruvchi agent.

---

## Kompyuterda ishga tushirish (Windows, PowerShell)

Kerak bo'ladi: [uv](https://docs.astral.sh/uv/), Node.js 22+, Docker Desktop (Postgres va Redis uchun).

```powershell
# 1. uv va pnpm o'rnatish (bir marta)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
corepack enable

# 2. Postgres va Redis (faqat lokal test uchun)
docker run -d --name airo-pg -e POSTGRES_USER=airo -e POSTGRES_PASSWORD=airo -e POSTGRES_DB=airo -p 5432:5432 postgres:17-alpine
docker run -d --name airo-redis -p 6379:6379 redis:7-alpine
```

### Backend
```powershell
cd $HOME\Desktop\airoconcept\backend
uv sync
Copy-Item .env.example .env
uv run python -m app.cli gen-keys        # chiqqan qiymatlarni .env ga qo'ying
uv run alembic upgrade head
uv run python -m app.cli create-user --email owner@airoconcept.uz --username admin --name "Ega" --role owner
uv run uvicorn app.main:app --reload     # http://localhost:8000/docs
```
Ikkinchi oynada worker (Instagram/Messenger xabarlari uchun):
```powershell
cd $HOME\Desktop\airoconcept\backend
uv run arq app.workers.worker.WorkerSettings
```
Testlar: `uv run pytest`

### Telegram bot
```powershell
cd $HOME\Desktop\airoconcept\backend
uv run python -m app.cli create-api-key --name "Telegram bot" --scopes agent:chat   # kalitni nusxalang

cd ..\bot
uv sync
Copy-Item .env.example .env          # BOT_TOKEN va BACKEND_API_KEY ni to'ldiring
uv run python -m bot.main
```

### Admin panel
```powershell
cd $HOME\Desktop\airoconcept\admin
pnpm install
pnpm dev                             # http://localhost:5173
```
Backend API o'zgarsa, tiplarni yangilash:
```powershell
cd ..\backend; uv run python -m app.cli export-openapi > ..\admin\src\api\openapi.json
cd ..\admin;   pnpm gen:api
```

### Sayt
```powershell
cd $HOME\Desktop\airoconcept\backend
uv run python -m app.cli create-api-key --name "Sayt" --scopes leads:write

cd ..\frontend
pnpm install
Copy-Item .env.example .env.local    # BACKEND_API_KEY ni to'ldiring
pnpm dev                             # http://localhost:3000
```

---

## Serverga joylash (Linux VPS)

1. DNS: `DOMAIN`, `www`, `api`, `my` va `web` subdomenlarini server IP manziliga yo'naltiring.
2. Serverda:
```bash
git clone <repo> airoconcept && cd airoconcept
cp .env.example .env                       # DOMAIN, POSTGRES_PASSWORD, REDIS_PASSWORD
cp backend/.env.example backend/.env       # ENV=production, DOCS_ENABLED=false, COOKIE_SECURE=true + kalitlar
cp bot/.env.example bot/.env               # BOT_MODE=webhook, WEBHOOK_BASE_URL=https://bot.DOMAIN
cp frontend/.env.example frontend/.env
docker compose up -d --build
docker compose run --rm backend python -m app.cli create-user --email owner@... --username admin --name "Ega" --role owner
docker compose run --rm backend python -m app.cli create-api-key --name "Telegram bot" --scopes agent:chat
docker compose run --rm backend python -m app.cli create-api-key --name "Sayt" --scopes leads:write
# kalitlarni bot/.env va frontend/.env ga yozib: docker compose up -d
```
3. Meta webhook: `https://api.DOMAIN/webhooks/meta` — batafsil [docs/META_SETUP.md](docs/META_SETUP.md).

### GitHub'dan avtomatik yangilash

`deploy/update.sh` yangi `main` commitini tekshiradi, barcha image'larni qayta build qiladi, migratsiyalarni
ishga tushiradi va servislarni yangilaydi. `deploy/systemd/` ichidagi timer uni har daqiqada ishga tushiradi.
Server tashqi Nginx ishlatsa, `deploy/nginx/airoconcept.uz.conf` namunasi frontendni `4800`, API'ni `4801`
va admin panelni `4802` portidan proxy qiladi. Caddy va Telegram bot standart holatda profilga ajratilgan:
ularni mos ravishda `docker compose --profile caddy up -d` va `docker compose --profile bot up -d` bilan
yoqish mumkin.

## Hujjatlar

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — tizim qanday tuzilgan, yangi kanal/modul qo'shish
- [docs/API.md](docs/API.md) — tashqi dasturlar uchun API va kalitlar
- [docs/META_SETUP.md](docs/META_SETUP.md) — Meta App, System User token, webhook
- [docs/SECURITY.md](docs/SECURITY.md) — xavfsizlik choralari va tekshiruv ro'yxati

## Agentni biznesga moslash

`backend/app/agents/sales/knowledge.json` — narxlar, materiallar, kafolat, e'tirozlarga javoblar, portfolio
havolalari. **Ishga tushirishdan oldin biznes egasi bilan birga to'ldiring** (hozir namunaviy qiymatlar).
Suhbat uslubi va qoidalar: `backend/app/agents/sales/prompt.py`.
