# Interyer va mebel platformasi — MVP-1 poydevori

Karobka uylarni mebel bilan jihozlash va interyer dizayn kompaniyasi uchun: backend, veb-sayt, CRM, Telegram hisob-kitob boti va chizmani tanish servisi. Mobil ilova bu repozitoriyda yo'q — u shu API'ga ulanadi.

## Tarkib

| Papka | Nima | Texnologiya | Port |
| --- | --- | --- | --- |
| `packages/core` | Umumiy biznes mantiq: pul, smeta, buyurtma holatlari, avtomatik qoidalar, OTP, bot parseri, kalkulyatorlar, 3D sahna tekshiruvi | TypeScript (kutubxonasiz) | — |
| `apps/api` | Backend: kirish (SMS-OTP), katalog, loyiha va 3D sahna, buyurtma, smeta, vazifalar, avtomatlashtirish, to'lovlar, moliya, fayllar, audit | NestJS, PostgreSQL (Prisma), Redis (BullMQ) | 4000 |
| `apps/web` | Mijoz sayti: bosh sahifa, katalog, kirish, 3D studiya, buyurtma, loyihalarim | Next.js 15, React Three Fiber | 3000 |
| `apps/admin` | CRM: buyurtmalar kanbani, buyurtma kartasi, smeta, vazifalar, katalog, moliya, xodimlar, avtomatik qoidalar | Next.js 15 | 3001 |
| `apps/bot` | Telegram hisob-kitob boti: kirim-chiqim matn bilan, kassa, qarzlar, loyiha foydasi, tasdiq, kalkulyator, kunlik hisobot | grammY | — |
| `services/plan-recognition` | DXF chizmadan xonalarni ajratish | Python, FastAPI, ezdxf | 8000 |

## Ishga tushirish (development)

Talablar: Node.js 22+, pnpm 9, Docker.

```bash
cp .env.example .env            # va barcha CHANGE_ME qiymatlarni almashtiring
docker compose up -d postgres redis minio
pnpm install
pnpm --filter @ip/core build
pnpm --filter @ip/api prisma:generate
pnpm --filter @ip/api prisma:migrate:dev --name init
OWNER_NAME="Sohibjon" OWNER_USERNAME=admin OWNER_PASSWORD="kuchli-parol" pnpm db:seed
pnpm dev                        # api :4000, web :3000, admin :3001, bot
```

`pnpm install` birinchi marta `pnpm-lock.yaml` yaratadi — uni git'ga qo'shing: Docker build aynan shu faylga qarab o'rnatadi (`--frozen-lockfile`).

MinIO konsolida (`http://127.0.0.1:9001`) `interyer` bucket yarating va `public/` papkasini ochiq o'qishga ruxsat bering (mahsulot rasmlari va 3D modellar uchun). `private/` yopiq qoladi.

Development rejimida `SMS_PROVIDER=console` — SMS kod API logida chiqadi.

## Testlar

```bash
pnpm --filter @ip/core test     # pul, OTP, holatlar, smeta, qoidalar, parser, kalkulyator, sahna — 9 ta test
pnpm --filter @ip/bot test      # tasdiqlash navbati, tezlik cheklovi — 4 ta test
cd services/plan-recognition && python -m unittest   # geometriya — 5 ta test
```

## Asosiy oqim

1. Mijoz saytda SMS kod bilan kiradi va xona yaratadi (o'lcham yoki DXF chizma).
2. 3D studiyada katalogdagi mebellarni qo'yadi, devor va polni tanlaydi. Narx serverda hisoblanadi.
3. Buyurtma beradi. Qoidalar o'lchovchini avtomatik tayinlaydi, mijozga SMS va xodimga Telegram xabar yuboradi.
4. O'lchovdan keyin menejer CRM'da smeta yaratadi. Mijoz yoki menejer uni tasdiqlaydi, keyin shartnoma bosqichi keladi.
5. Payme yoki Click orqali avans tushadi. Buyurtma avtomatik "Avans to'landi" ga o'tadi, sex va ta'minotga vazifa ketadi.
6. Ombor, yetkazish va o'rnatish bosqichlaridan keyin mijoz aktni imzolaydi va qolgan to'lov yopiladi.
7. Har bir xarajat botga yoziladi, shuning uchun har bir buyurtmaning sof foydasi `/loyiha 1042` bilan ko'rinadi.

Koordinator ishini `packages/core/src/automation.ts` dagi qoidalar bajaradi. Rahbar ularni CRM'dagi "Avtomatik qoidalar" bo'limida yoqadi, o'chiradi va kechikishini sozlaydi. Har 10 daqiqada muddati o'tgan vazifalar rahbarga ko'tariladi.

## API qisqacha

| Marshrut | Kim |
| --- | --- |
| `POST /auth/otp/request`, `/auth/otp/verify`, `/auth/refresh`, `/auth/logout`, `GET /auth/me` | hamma |
| `GET /catalog/products`, `/catalog/products/:slug`, `/catalog/categories`, `/catalog/materials` | ochiq |
| `POST/PATCH /catalog/admin/...` | rahbar, menejer, ta'minot |
| `POST /projects`, `GET /projects/mine`, `PUT /projects/:id/rooms/:roomId/scene`, `GET /projects/:id/estimate-preview` | mijoz (o'ziniki), xodim |
| `POST /orders`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/transition` | rolga qarab |
| `POST /orders/:id/estimates`, `/estimates/:v/approve`, `/acceptance`, `PATCH /orders/:id/assign` | rolga qarab |
| `GET/PATCH /tasks` | xodimlar |
| `/finance/*` (CRM), `/internal/finance/*` (bot) | rahbar, buxgalter, menejer, prorab, ta'minot |
| `POST /payments/payme`, `/payments/click/prepare`, `/payments/click/complete` | to'lov tizimlari |
| `POST /files/uploads`, `GET /files/:id/url` | kirgan foydalanuvchi |
| `GET/PATCH /automation/rules`, `/staff` | rahbar |

Mobil ilova `X-Client: mobile` sarlavhasi bilan kiradi va tokenlarni javob tanasida oladi (`Authorization: Bearer`). Sayt va CRM httpOnly cookie ishlatadi.

## Hali qilinmagan (keyingi bosqichlar)

- Rasm va PDF rejalarni tanish (neyron tarmoq), butun uyni 3D'da ko'rish (MVP-2)
- Dizayn moduli: brif, konsepsiya, render tasdiqlash (MVP-2)
- Xodimlar mobil ilovasi, push xabarlar (FCM)
- Ishlab chiqarish va ombor, ta'mir moduli, telefoniya, analitika, AR, real render (V3)
- Chek suratidan summani o'qish (OCR) va maosh/sdelka (bot v2)

Xavfsizlik: [SECURITY.md](SECURITY.md).
