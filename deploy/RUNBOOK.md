# IZLAN — production runbook

Bu hujjat production muhitni qanday ishga tushirish, yangilash, tiklash va nosozlikda nima qilishni tavsiflaydi.
Hech qanday maxfiy qiymat bu yerga yozilmaydi.

## 1. Arxitektura

```
mijoz ──HTTPS──> Nginx (443) ──> Next.js client (127.0.0.1:3000) ──/api/*──> Nest server (127.0.0.1:4000) ──> PostgreSQL (lokal)
                                                        pay-bot ──/api/internal/*──> 127.0.0.1:4000 (Nginx orqali EMAS)
```
- Ma'lumotlar O'zbekistondagi data-markazda (shaxsiy ma'lumotlarni mahalliylashtirish talabi — yurist tasdig'i bilan).
- Firewall: faqat 80/443 ochiq; SSH — kalit bilan, cheklangan IP'lardan. 3000/4000/5432 tashqariga yopiq.

## 2. Muhit (env) — majburiy tekshiruv
| O'zgaruvchi | Talab |
|---|---|
| `NODE_ENV` | `production` (server: `MAIL_DRIVER=console` taqiqlanadi, `AUTH_SECRET` ≥ 32 belgi tekshiriladi) |
| `AUTH_SECRET`, `BOT_INTERNAL_TOKEN`, `GRAMMAR_INTERNAL_TOKEN` | tasodifiy, ≥ 32 belgi; dev qiymatlaridan farqli |
| `DATABASE_URL` | alohida DB foydalanuvchisi, kuchli parol |
| `APP_URL` | `https://izlan.uz` (email logo shu orqali) |
| `TRUST_PROXY_HOPS` | `1` (Nginx X-Forwarded-For'ni almashtirgani uchun) |
| client `API_URL`, `NEXT_PUBLIC_SITE_URL`, `SESSION_COOKIE_NAME` | prod qiymatlari |

## 3. Deploy (har reliz)
1. CI yashil (client `ci:local`, server testlar + migrate).
2. **Backup** (5-bo'lim skripti) — migratsiyadan oldin majburiy.
3. Server: `npm ci && npx prisma generate && npm run build && npx prisma migrate deploy` → servisni qayta ishga tushirish.
4. Client: `npm ci && npm run build` → servisni qayta ishga tushirish.
5. Smoke: `curl -fsS https://izlan.uz/api/health` → `{"status":"ok","db":"ok"}`; landing, login, `/student` (307 → /login), test hisob bilan dars ochish.
6. Oldingi build papkalari (client `.next`, server `dist`) bitta reliz orqaga saqlanadi.

## 4. Rollback
- Kod: oldingi build papkasiga qaytish va servislarni qayta ishga tushirish.
- Migratsiya: Prisma `migrate deploy` orqaga qaytarmaydi. Har migratsiya uchun qo'lda yozilgan down-SQL tayyorlanadi; buzilgan holatda — oxirgi backup'dan tiklash (6-bo'lim).

## 5. Backup
- `deploy/backup.sh.example` asosida: DB (`pg_dump -Fc`) + `uploads/`, `age` bilan shifrlangan, off-site nusxa (`rclone`), 14 kun lokal.
- Shifrlash kaliti (age secret key) serverda EMAS — alohida xavfsiz joyda (2 kishi biladi).

## 6. Restore testi (oyiga 1 marta, natija jurnalga yoziladi)
1. Alohida (staging) mashinada: `age -d -i key.txt db-*.dump.age | pg_restore --no-owner -d izlan_restore`.
2. `uploads-*.tar.age` ni ochib, `UPLOAD_DIR` ga joylash.
3. Server'ni restore DB bilan ishga tushirib, `/api/health`, login va bitta dars mediasini tekshirish.
4. Vaqtni o'lchash (maqsad: < 1 soat). Muvaffaqiyatsiz bo'lsa — incident.

## 7. Monitoring va loglar
- Uptime: `/api/health` ni tashqi xizmat 1 daqiqada tekshiradi; 2 marta ketma-ket xato → alert.
- SSL: certbot timer; sertifikat muddati < 14 kun → alert.
- Resurslar: disk (uploads o'sishi), RAM, CPU, Postgres ulanishlari.
- Email kvotasi: kunlik limitning 80% iga yetsa alert (`EMAIL_DAILY_LIMIT`).
- Loglarda parol, OTP kodi, token, to'liq karta raqami yozilmaydi.

## 8. Incident (qisqa tartib)
1. Aniqlash va baholash (kim, nima, qachondan) — yozib borish.
2. Cheklash: zarur bo'lsa xizmatni o'chirish yoki `/api/internal` tokenini rotatsiya qilish.
3. Shaxsiy ma'lumot sizib chiqqan bo'lsa — yurist orqali vakolatli organ va foydalanuvchilarni xabardor qilish.
4. Tiklash (backup) va post-mortem.

## To'lov kuzatuvchisi nazorati

`GET http://127.0.0.1:4000/api/internal/incomes/stats` (sarlavha `x-bot-token`) — faqat server ichidan.
Alert qoidalari (tavsiya):
- `oldestReviewAgeMinutes > 60` — ko'rib chiqilmagan to'lov bor (foydalanuvchi pul o'tkazgan, balansi to'lmagan).
- `pendingTopups > 0` va `lastIncomeAgeMinutes > 180` (ish vaqtida) — bot bank xabarlarini o'qimayotgan bo'lishi mumkin.
