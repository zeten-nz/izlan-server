# Izlan backup (VPS ichida)

PostgreSQL (`pg_dump -Fc`) + `uploads/` (`tar.gz`) → `/var/backups/izlan/<UTC vaqt>/`. Har kuni 03:00 (systemd timer).
Windows/tashqi nusxa YO'Q — faqat shu VPS. (Server diski yo'qolsa, backup ham yo'qoladi: qarang «Qolgan xavflar».)

Har backup papkasi: `db.dump`, `uploads.tar.gz`, `META.txt`, `SHA256SUMS`, `COMPLETE`.

## Qoidalar
- Backup `.tmp-*` da yig'iladi, tekshiriladi (dump o'qiladi, gzip/tar butun, SHA256), keyin atomik nom oladi.
- Eski nusxa faqat YANGI backup to'liq muvaffaqiyatli bo'lgach o'chiriladi. Saqlanadi: oxirgi 7 KUN (har kundan eng so'nggisi).
- Disk yetmasa (`IZLAN_MIN_FREE_MB` + kerakli hajm): log + non-zero kod, hech narsa o'chirilmaydi.
- Restore standarti: faqat YANGI DB / bo'sh papka. Production'ga — faqat interaktiv terminalda, qo'lda tasdiq bilan.

## O'rnatish (root, VPS'da; sinalmagan — UNVERIFIED)
```bash
# 1) foydalanuvchi, papkalar
useradd --system --home /var/lib/izlan-backup --shell /usr/sbin/nologin izlan-backup
install -d -o izlan-backup -g izlan-backup -m 700 /var/backups/izlan
install -d -m 755 /opt/izlan-backup /etc/izlan-backup
cp scripts/backup/{backup.sh,restore.sh,lib.sh} /opt/izlan-backup/ && chmod 755 /opt/izlan-backup/*.sh

# 2) sozlama (DB nomi, uploads yo'li); parol faylga yozilmaydi
install -m 600 -o izlan-backup scripts/backup/backup.env.example /etc/izlan-backup/backup.env
$EDITOR /etc/izlan-backup/backup.env

# 3) PostgreSQL: o'qish huquqli rol (izlan-backup shu rol bilan ulanadi)
sudo -u postgres psql -c "CREATE ROLE izlan_backup LOGIN PASSWORD '<parol>' IN ROLE pg_read_all_data;"
#   parol: /etc/izlan-backup/pgpass (chmod 600, egasi izlan-backup), backup.env'da PGUSER+PGPASSFILE
#   uploads papkasi izlan-backup uchun o'qiladigan bo'lishi kerak

# 4) systemd
cp scripts/backup/systemd/izlan-backup.{service,timer} /etc/systemd/system/
#    service ichidagi ReadWritePaths/ReadOnlyPaths ni o'z yo'llaringizga moslang (uploads yo'li, log)
systemctl daemon-reload && systemctl enable --now izlan-backup.timer

# 5) birinchi marta qo'lda sinash
systemctl start izlan-backup.service && journalctl -u izlan-backup -n 30 --no-pager
ls -la /var/backups/izlan
```
Holat: `systemctl list-timers izlan-backup.timer`, `journalctl -u izlan-backup`.

## Restore
```bash
B=/var/backups/izlan/20261013T030000Z
/opt/izlan-backup/restore.sh $B --verify-only                       # faqat yaxlitlik
/opt/izlan-backup/restore.sh $B --db izlan_restore_test --uploads-dir /srv/izlan-restore/uploads
```
Natijani tekshiring (qatorlar soni, fayllar) — keyin kerak bo'lsa ilovani shu DB/papkaga yo'naltiring.

**Production'ga tiklash** (faqat falokatda): avval ilovani to'xtating va `backup.sh` bilan yangi nusxa oling, so'ng
`restore.sh $B --db <prod_db> --uploads-dir <prod_uploads> --overwrite-existing` va so'ralganda aynan
`RESTORE-PRODUCTION <nom>` ni terminalga qo'lda yozing. Cron/pipe/skript orqali bu rejim ishlamaydi.

## Test holati
Lokal (Windows Git Bash + PostgreSQL 18, scratch DB + nusxa media): backup, retention, disk-to'la to'xtash, noto'g'ri DB,
yangi DB'ga restore, mavjud scratch DB'ga overwrite, buzilgan backup rad etilishi, production rad etilishi — **tekshirildi**.

**UNVERIFIED (Linux VPS'da sinalmagan):** systemd service/timer (sandbox direktivalari, `ProtectSystem`), `flock` yo'li,
`pg_read_all_data` roli va `PGPASSFILE` ulanishi, `izlan-backup` foydalanuvchisining uploads'ni o'qishi,
production uchun interaktiv `RESTORE-PRODUCTION` tasdiq yo'li (faqat rad etish tomoni sinalgan), katta hajmdagi ish vaqti.

## Qolgan xavflar
- Backup shu VPS'da: disk/server yo'qolsa nusxalar ham yo'qoladi (tashqi nusxa hozircha ongli ravishda yo'q).
- Backup shifrlanmagan — `/var/backups/izlan` huquqlari 700 bo'lishi shart.
- Xato haqida xabar faqat journal/log'da (e-mail/alert yo'q) — vaqti-vaqti bilan `systemctl status izlan-backup` ni ko'ring.
- DB dump va uploads bir lahzada emas, ketma-ket olinadi (dump → uploads); media faqat qo'shiladi, shuning uchun
  dump'dagi har bir fayl arxivda bor, lekin arxivda dump'da yo'q yangi fayllar bo'lishi mumkin (zararsiz).
