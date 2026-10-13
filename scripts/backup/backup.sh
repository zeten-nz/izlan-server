#!/usr/bin/env bash
# Izlan backup: PostgreSQL (pg_dump -Fc) + uploads/ (tar.gz) → BACKUP_ROOT/<UTC vaqt>/
#
# Xavfsizlik qoidalari:
#  - Backup avval `.tmp-<nom>` papkasida yig'iladi, to'liq tekshiriladi, KEYIN atomik ravishda yakuniy nomga o'tadi.
#  - Eski nusxalar faqat yangi backup to'liq muvaffaqiyatli bo'lgach (retention qadamida) o'chiriladi.
#  - Disk joyi yetmasa: log + non-zero kod bilan to'xtaydi; mavjud backup'lar O'CHIRILMAYDI.
#
# Chiqish kodlari: 0 OK | 10 buyruq yo'q | 11 konfiguratsiya | 12 qulf | 20 disk joyi | 30 dump | 40 uploads | 50 tekshiruv
#
#   IZLAN_BACKUP_CONFIG=/etc/izlan-backup/backup.env ./backup.sh
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

load_config
require_vars IZLAN_DB_NAME IZLAN_UPLOADS_DIR
BACKUP_ROOT="${IZLAN_BACKUP_ROOT:-/var/backups/izlan}"
LOG_FILE="${IZLAN_LOG_FILE:-}"
KEEP_DAYS="${IZLAN_KEEP_DAYS:-7}"
MIN_FREE_MB="${IZLAN_MIN_FREE_MB:-1024}"
COUNT_TABLES="${IZLAN_COUNT_TABLES:-User Asset LessonVersion}"
[[ "$KEEP_DAYS" =~ ^[1-9][0-9]*$ ]] || die 11 "IZLAN_KEEP_DAYS musbat butun son bo'lishi kerak"

need_cmd pg_dump; need_cmd pg_restore; need_cmd psql; need_cmd tar; need_cmd gzip
need_cmd sha256sum; need_cmd df; need_cmd du

[[ -d "$IZLAN_UPLOADS_DIR" ]] || die 11 "uploads papkasi yo'q: $IZLAN_UPLOADS_DIR"
umask 077
mkdir -p "$BACKUP_ROOT"
acquire_lock "$BACKUP_ROOT/.backup.lock"

NAME="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$BACKUP_ROOT/$NAME"
TMP="$BACKUP_ROOT/.tmp-$NAME"
[[ ! -e "$FINAL" ]] || die 12 "Bu nomdagi backup allaqachon bor: $FINAL"

# Har qanday chiqishda (xato, die, signal): yarim papka tozalanadi; mavjud backup'larga tegilmaydi.
# Muvaffaqiyatda TMP allaqachon FINAL'ga ko'chirilgan, shuning uchun bu yerda yo'q.
on_exit() {
  local rc=$?
  if [[ -d "$TMP" ]]; then
    if (( rc != 0 )); then err "Backup to'xtadi (kod $rc). Mavjud backup'lar o'zgarmadi."; fi
    rm -rf -- "$TMP"
  fi
  if [[ -n "${LOCK_DIR:-}" ]]; then rmdir "$LOCK_DIR" 2>/dev/null || true; fi
  return "$rc"
}
trap on_exit EXIT
trap 'exit 130' INT TERM

info "=== Backup boshlandi: DB=$IZLAN_DB_NAME uploads=$IZLAN_UPLOADS_DIR → $FINAL ==="

# 0) Oldingi muvaffaqiyatsiz urinishlardan qolgan yarim `.tmp-*` papkalar (backup EMAS, tugallanmagan chiqindi).
#    Qulf ushlab turilgani uchun boshqa jarayonga tegishli emas.
for stale in "$BACKUP_ROOT"/.tmp-*; do
  [[ -d "$stale" ]] && { warn "oldingi yarim urinish o'chirilmoqda: $stale"; safe_rm_tree "$BACKUP_ROOT" "$stale"; }
done

# 1) Disk joyi: DB hajmi (siqilgan dump odatda kichikroq) + uploads hajmi + zaxira. Yetmasa — to'xtash.
db_bytes="$(psql -d "$IZLAN_DB_NAME" -Atc 'select pg_database_size(current_database())' 2>/dev/null)" \
  || die 30 "PostgreSQL'ga ulanib bo'lmadi (DB=$IZLAN_DB_NAME)"
up_kb="$(du -sk "$IZLAN_UPLOADS_DIR" | awk '{print $1}')"
need_mb=$(( db_bytes / 1024 / 1024 + up_kb / 1024 + 16 ))
have_mb="$(free_mb "$BACKUP_ROOT")"
info "Bo'sh joy: ${have_mb} MB; kerak: ${need_mb} MB + zaxira ${MIN_FREE_MB} MB"
if (( have_mb < need_mb + MIN_FREE_MB )); then
  die 20 "DISK JOYI YETARLI EMAS: bo'sh ${have_mb} MB < kerak ${need_mb} MB + zaxira ${MIN_FREE_MB} MB. Backup TO'XTATILDI, hech narsa o'chirilmadi."
fi

mkdir -p "$TMP"

# 2) Jadval qatorlari soni (restore tekshiruvi uchun) — dump'dan oldin va keyin
count_rows() { psql -d "$IZLAN_DB_NAME" -Atc "select count(*) from \"$1\"" 2>/dev/null || echo "-1"; }
declare -A BEFORE AFTER
for t in $COUNT_TABLES; do BEFORE[$t]="$(count_rows "$t")"; done

# 3) PostgreSQL dump — AVVAL DB, KEYIN uploads: media faqat qo'shiladi, shuning uchun dump'dagi har bir Asset qatorining
#    fayli arxivda bo'ladi.
info "pg_dump -Fc ..."
pg_dump -d "$IZLAN_DB_NAME" -Fc --no-owner -f "$TMP/db.dump" || die 30 "pg_dump muvaffaqiyatsiz"
[[ -s "$TMP/db.dump" ]] || die 30 "dump fayli bo'sh"
for t in $COUNT_TABLES; do AFTER[$t]="$(count_rows "$t")"; done

# 4) uploads → tar.gz. tar kodi 1 = "fayl o'qish vaqtida o'zgardi" (jonli papka) — ogohlantirish, xato emas.
info "uploads arxivlanmoqda ..."
rc=0
tar -czf "$TMP/uploads.tar.gz" -C "$IZLAN_UPLOADS_DIR" . || rc=$?
if (( rc == 1 )); then warn "uploads arxivlanayotganda ba'zi fayllar o'zgardi (tar kodi 1) — arxiv qabul qilindi"
elif (( rc != 0 )); then die 40 "tar muvaffaqiyatsiz (kod $rc)"; fi

# 5) Tekshiruv: dump o'qiladi, arxiv butun, fayllar soni
pg_restore --list "$TMP/db.dump" >"$TMP/db.toc" 2>/dev/null || die 50 "dump yaroqsiz: pg_restore --list xato berdi"
toc_entries="$(grep -vc '^;' "$TMP/db.toc" || true)"
rm -f "$TMP/db.toc"
(( toc_entries > 5 )) || die 50 "dump mazmuni shubhali kichik (TOC=$toc_entries)"
gzip -t "$TMP/uploads.tar.gz" || die 50 "uploads.tar.gz buzilgan"
tar -tzf "$TMP/uploads.tar.gz" >/dev/null || die 50 "uploads.tar.gz o'qilmadi"
files_in_tar="$(tar -tzf "$TMP/uploads.tar.gz" | grep -vc '/$' || true)"
files_on_disk="$(find "$IZLAN_UPLOADS_DIR" -type f | wc -l | tr -d ' ')"

# 6) META + SHA256SUMS
{
  printf 'format=1\ncreated_at=%s\ndb_name=%s\ntoc_entries=%s\nuploads_files=%s\nuploads_files_on_disk=%s\n' \
    "$(ts)" "$IZLAN_DB_NAME" "$toc_entries" "$files_in_tar" "$files_on_disk"
  for t in $COUNT_TABLES; do printf 'rows.%s=%s,%s\n' "$t" "${BEFORE[$t]}" "${AFTER[$t]}"; done
} >"$TMP/META.txt"
( cd "$TMP" && sha256sum db.dump uploads.tar.gz META.txt >SHA256SUMS && sha256sum -c SHA256SUMS >/dev/null ) \
  || die 50 "SHA256SUMS tekshiruvi muvaffaqiyatsiz"

# 7) Yakunlash: COMPLETE belgisi → atomik nom o'zgartirish
printf '%s\n' "$(ts)" >"$TMP/COMPLETE"
mv -- "$TMP" "$FINAL"
info "backup tayyor: $FINAL (dump $(du -k "$FINAL/db.dump" | awk '{print $1}') KB, uploads ${files_in_tar} fayl)"

# 8) Retention — faqat shu yerga yetib kelgan bo'lsa (hammasi muvaffaqiyatli).
#    Eng yangi KEEP_DAYS ta KUN saqlanadi (har kundan eng so'nggi nusxa); qolganlari o'chiriladi.
declare -A KEEP_DIR=() SEEN=()
seen_days=0
while IFS= read -r d; do
  day="$(basename "$d")"; day="${day:0:8}"
  if [[ -z "${SEEN[$day]:-}" ]]; then
    SEEN[$day]=1
    seen_days=$(( seen_days + 1 ))
    (( seen_days <= KEEP_DAYS )) && KEEP_DIR[$d]=1
  fi
done < <(list_complete_backups "$BACKUP_ROOT" | sort -r)
[[ -n "${KEEP_DIR[$FINAL]:-}" ]] || die 50 "retention: yangi backup saqlanadigan ro'yxatda emas (mantiqiy xato) — hech narsa o'chirilmadi"
while IFS= read -r d; do
  [[ -n "${KEEP_DIR[$d]:-}" ]] && continue
  info "retention: eski nusxa o'chirilmoqda: $d"
  safe_rm_tree "$BACKUP_ROOT" "$d"
done < <(list_complete_backups "$BACKUP_ROOT")

info "=== Backup muvaffaqiyatli ==="
