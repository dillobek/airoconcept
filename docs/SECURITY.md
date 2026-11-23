# Xavfsizlik

## Amalga oshirilgan choralar

**Autentifikatsiya**
- Parollar argon2id bilan hash qilinadi; login vaqt bo'yicha foydalanuvchi bor-yo'qligini oshkor qilmaydi
- Admin sessiyasi: `httpOnly`, `Secure`, `SameSite=Strict` cookie (JavaScript o'qiy olmaydi → XSS'dan himoya)
- 2FA (TOTP, Google Authenticator) — admin paneldan yoqiladi
- Login: daqiqasiga 5 urinish limiti, barcha muvaffaqiyatsiz urinishlar audit log'da

**Ruxsatlar**
- Rollar: `owner`, `manager`, `accountant`, `worker` (`app/models/user.py → ROLE_SCOPES`)
- API kalitlar: faqat SHA-256 hash saqlanadi, scope'lar, IP allowlist, muddat, revoke
- API kalitlarni faqat `owner` yaratadi

**Kiruvchi so'rovlar**
- Meta webhook: `X-Hub-Signature-256` HMAC tekshiruvi (`hmac.compare_digest`)
- Telegram webhook: `secret_token` tekshiruvi (aiogram)
- Rate limit: umumiy 300/daq, agent 120/daq, sayt formasi 5/10daq + honeypot

**AI agent**
- Agentning tool'lari cheklangan: moliya, boshqa mijozlar, reklama boshqaruviga **umuman kira olmaydi**.
  Prompt injection bo'lsa ham bu amallarni bajarib bo'lmaydi
- Agent lead'ning faqat ruxsat etilgan maydonlarini o'zgartira oladi (`AGENT_WRITABLE_LEAD_FIELDS`)
- Chiqish filtri: tokenlar yoki tizim ko'rsatmalari javobga tushsa, xavfsiz javob bilan almashtiriladi
- Har mijozga kunlik xabar limiti (LLM xarajatidan himoya); yopilgan suhbatlarga LLM chaqirilmaydi
- Agentning har bir amali audit log'da (`actor="agent"`)

**Ma'lumotlar va infratuzilma**
- Sirlar faqat `.env` da; `.gitignore` ularni chiqarib tashlaydi
- Bazadagi tokenlarni shifrlash uchun Fernet (`app/core/security.py → encrypt/decrypt`)
- Loglarda API kalit, Meta, Telegram va Anthropic tokenlari avtomatik maskalanadi
- Postgres va Redis tashqariga ochilmaydi (faqat docker ichki tarmog'i), Redis parol bilan
- Konteynerlar root bo'lmagan foydalanuvchi bilan ishlaydi
- Xavfsizlik headerlari: HSTS, X-Frame-Options, nosniff, CSP (admin), Referrer-Policy
- Production'da `/docs` yopiq

## Serverga chiqarishdan oldin tekshiruv
- [ ] `backend/.env`: `ENV=production`, `DOCS_ENABLED=false`, `COOKIE_SECURE=true`
- [ ] `SECRET_KEY`, `ENCRYPTION_KEY` — `gen-keys` bilan yangi, development'dagidan boshqa
- [ ] Owner akkauntida 2FA yoqilgan
- [ ] Bot va sayt kalitlarida faqat kerakli scope (`agent:chat`, `leads:write`)
- [ ] Server: SSH faqat kalit bilan, root login o'chiq, `ufw allow 22,80,443`, fail2ban
- [ ] Postgres backup har kuni (shifrlangan, boshqa joyga) va oyda bir marta tiklash testi
- [ ] `uv run pip-audit` va `uv run bandit -r app` — toza

## Tekshiruv buyruqlari
```bash
cd backend
uv run pytest          # 23 test
uv run ruff check .
uv run bandit -r app -ll
uv run pip-audit
```
