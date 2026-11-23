# Meta sozlash (Instagram + Facebook)

Tizim faqat bitta biznes uchun bo'lgani sababli **Standard Access yetadi, App Review shart emas**.
Tanlangan yo'l: **API setup with Facebook Login** (Messenger, Lead Ads va Ads ham bitta token bilan ishlaydi).

## 1. Biznes egasi bilan (20–30 daqiqa)
- [ ] business.facebook.com — egasining Business portfolio'si (egasi admin)
- [ ] Facebook sahifa va Instagram Professional akkaunt portfolio'ga qo'shilgan, IG sahifaga ulangan
- [ ] Sizni portfolio'ga admin qilib qo'shish
- [ ] Instagram ilovasida: Settings → Messages and story replies → Message controls → Connected tools →
      **Allow access to messages** — YOQILGAN
- [ ] (Tavsiya) Business Verification — MChJ hujjatlari bilan

## 2. Meta App
- [ ] developers.facebook.com → Create App → egasining portfolio'si
- [ ] Use case'lar: Instagram messaging & content (**Facebook Login**), Messenger, Page management, Lead Ads
- [ ] App Settings → Basic: Privacy Policy `https://DOMAIN/privacy`, Terms `https://DOMAIN/terms`,
      Data deletion `https://DOMAIN/data-deletion`, App icon, Category
- [ ] App Secret → `backend/.env` → `META_APP_SECRET`

## 3. Webhook
- [ ] `uv run python -m app.cli gen-keys` → `META_VERIFY_TOKEN` ni `backend/.env` ga
- [ ] Backend serverda HTTPS bilan ishlab turgan bo'lishi kerak
- [ ] Webhooks → Callback URL: `https://api.DOMAIN/webhooks/meta`, Verify token: o'sha qiymat
- [ ] Page maydonlari: `messages`, `messaging_postbacks`, `feed`, `leadgen`
- [ ] Instagram maydonlari: `messages`, `messaging_postbacks`, `comments`

## 4. System User token
Business Settings → Users → System users → Add (Admin) → Assign assets (Page — Full control, Instagram,
App, kerak bo'lsa Ad account) → Generate token → Expiration: **Never** → ruxsatlar:

```
pages_show_list, pages_manage_metadata, pages_messaging, pages_read_engagement,
pages_manage_engagement, pages_manage_posts,
instagram_basic, instagram_manage_messages, instagram_manage_comments, instagram_content_publish,
leads_retrieval, ads_management, ads_read, business_management
```

## 5. Page token va obuna (bash/Git Bash)
```bash
export V=v26.0
export SYS_TOKEN='...'
curl -s "https://graph.facebook.com/$V/me/accounts?access_token=$SYS_TOKEN"
# javobdan PAGE_ID va access_token (PAGE_TOKEN) ni oling
export PAGE_ID='...'; export PAGE_TOKEN='...'
curl -s -X POST "https://graph.facebook.com/$V/$PAGE_ID/subscribed_apps" \
  -d "subscribed_fields=messages,messaging_postbacks,feed,leadgen" -d "access_token=$PAGE_TOKEN"
curl -s "https://graph.facebook.com/$V/$PAGE_ID?fields=instagram_business_account&access_token=$PAGE_TOKEN"
```
`backend/.env` ga: `META_PAGE_ID`, `META_PAGE_TOKEN`, `META_IG_USER_ID`.

## 6. Lead Ads
Business Settings → Integrations → Leads Access → sahifa → App'ni qo'shish.

## 7. Live va test
- [ ] App → Publish (Live). Webhooklar faqat Live rejimda keladi
- [ ] Boshqa akkauntdan IG'ga DM yozing → admin panelda lead paydo bo'lishi kerak

## Muammolar
| Belgi | Sabab |
|---|---|
| Verify o'tmayapti | HTTPS yo'q yoki META_VERIFY_TOKEN mos emas |
| FB keladi, IG kelmaydi | "Allow access to messages" o'chiq |
| Webhook 403 | META_APP_SECRET noto'g'ri (imzo mos kelmaydi) |
| Javob yuborilmaydi | 24 soatlik oyna o'tgan yoki tokenda `pages_messaging` yo'q |
