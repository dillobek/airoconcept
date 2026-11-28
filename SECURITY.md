# Xavfsizlik

Bu hujjat tizimda qanday himoya qilinganini va ishga tushirishdan oldin nimani tekshirish kerakligini yozadi.

## Kodda qilingan himoya

| Xavf | Himoya | Qayerda |
| --- | --- | --- |
| Zaif yoki unutilgan sozlama | Server ishga tushishda barcha kalitlarni tekshiradi: kamida 32 belgi, `CHANGE_ME` emas, har xil; productionda faqat https va haqiqiy SMS | `apps/api/src/config/env.ts` |
| OTP kodini terish (brute force) | Kod 6 xonali, 2 daqiqa amal qiladi, 5 urinish; urinish atomik hisoblanadi; bir vaqtda bitta kod | `auth.service.ts`, `packages/core/src/otp.ts` |
| SMS-bombing | Raqamga 60 soniyada 1 ta, soatiga 5 ta; IP dan soatiga 20 ta; nginx'da qo'shimcha limit | `auth.service.ts`, `infra/nginx.conf` |
| Baza o'g'irlansa OTP/token tiklanishi | OTP — HMAC(pepper), refresh token — SHA-256; ochiq holda saqlanmaydi | `otp.ts`, `auth.service.ts` |
| Token o'g'irlanishi | Access token 15 daqiqa; refresh rotatsiya; eski refresh qayta ishlatilsa butun sessiya oilasi bekor | `auth.service.ts` |
| XSS orqali token o'g'irlash | Sayt va CRM'da token faqat `httpOnly` cookie'da; CSP sarlavhalari; foydalanuvchi matni HTML sifatida chiqmaydi | `auth.controller.ts`, `next.config.mjs` |
| CSRF | `SameSite=Strict` + double-submit CSRF token har bir o'zgartiruvchi so'rovda | `common/guards.ts` |
| Bloklangan xodim | Har so'rovda foydalanuvchi bazadan tekshiriladi; rol tokendan emas, bazadan; rol o'zgarsa sessiyalar bekor | `common/guards.ts`, `users.module.ts` |
| Begona buyurtma/loyihani ko'rish (IDOR) | Har bir buyurtma va loyiha egasi/biriktirilgan xodim bo'yicha tekshiriladi, topilmasa 404 | `orders.module.ts`, `projects.module.ts` |
| Narxni klientdan o'zgartirish | Narx faqat serverda, bazadagi narxlardan; sahnadagi ortiqcha maydonlar tashlanadi | `projects.module.ts`, `core/scene.ts` |
| Buyurtma bosqichini sakrash | Holat mashinasi: faqat ruxsat etilgan o'tish, rol va shart (avans, smeta, akt) bilan; optimistik qulf | `core/order-state.ts` |
| Noto'g'ri kirish ma'lumoti | Barcha kirishlar Zod bilan tekshiriladi, ortiqcha maydonlar tashlanadi, o'lcham cheklangan | har bir modul |
| SQL injection | Faqat Prisma (parametrlangan so'rovlar) | — |
| Pul hisobida yaxlitlash xatosi | Pul — butun son, tiyinda; BigInt; float ishlatilmaydi | `core/money.ts`, `core/estimate.ts` |
| Pul yozuvini o'chirish | Yozuvlar o'chirilmaydi, faqat sababi bilan bekor qilinadi; katta xarajat rahbar tasdig'isiz kuchga kirmaydi | `finance.module.ts` |
| Bot tugmasini ikki marta bosish | Idempotentlik kaliti; tasdiqlanmagan yozuv faqat egasiga, bir marta | `finance.module.ts`, `bot/src/pending.ts` |
| Soxta to'lov webhooki | Payme: Basic auth; Click: MD5 imzo; vaqt bo'yicha solishtirish `timingSafeEqual`; idempotent | `payments.module.ts` |
| Fayl yuklash orqali hujum | Kalit (yo'l) serverda yaratiladi; tur va hajm imzoga kiradi; yopiq fayllar 5 daqiqalik havola bilan | `files.module.ts` |
| Ichki marshrutlar | Ichki token + Telegram ID; nginx'da `/internal/` tashqaridan yopiq | `guards.ts`, `infra/nginx.conf` |
| Maxfiy ma'lumot logga tushishi | Authorization, cookie, OTP kodi, refresh token logda yashiriladi; telefon raqam qisman | `app.module.ts`, `core/phone.ts` |
| Xato orqali ichki ma'lumot sizishi | 500 xatoda stack/SQL mijozga ketmaydi, faqat so'rov ID | `common/http.ts` |
| Kim nima qildi | Har bir o'zgartiruvchi so'rov va pul amali audit jurnaliga yoziladi | `common/audit.ts` |
| Konteyner | Root bo'lmagan foydalanuvchi, `no-new-privileges`, DB/Redis faqat 127.0.0.1 | Dockerfile'lar, `docker-compose.yml` |

## Ishga tushirishdan oldin (majburiy)

- [ ] `.env` dagi barcha `CHANGE_ME` qiymatlarni `openssl rand -base64 48` bilan almashtirish
- [ ] `NODE_ENV=production`, `SMS_PROVIDER=eskiz`, barcha URL'lar `https://`
- [ ] nginx'da `/internal/` yopiqligini tekshirish: `curl https://api.../internal/telegram/me` → 404
- [ ] Payme va Click **sandbox** testlaridan to'liq o'tish; webhooklarni ularning IP manzillari bilan cheklash
- [ ] PostgreSQL zaxira nusxasi har kuni, boshqa serverga; tiklashni sinab ko'rish
- [ ] CRM'ni ofis IP manzillari bilan cheklash (tavsiya)
- [ ] `pnpm audit --prod` — zaif kutubxonalar yo'qligini tekshirish
- [ ] Yurist bilan: ommaviy oferta, maxfiylik siyosati, SMS kod bilan tasdiqlashning yuridik kuchi
- [ ] Mustaqil xavfsizlik tekshiruvi (pentest) — ishga tushirishdan oldin tavsiya etiladi

## Zaiflik topsangiz

Ochiq joyda yozmang. [Mas'ul shaxs e-pochtasi] ga yuboring.
